"""Load html from files, clean up, split, ingest into Chroma."""
import logging
import os
import re
from pathlib import Path
from typing import Iterator

from parser import rustore_docs_extractor

from bs4 import BeautifulSoup, SoupStrainer
from langchain_community.document_loaders import SitemapLoader
from langchain.indexes import SQLRecordManager, index
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_core.embeddings import Embeddings
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


DATABASE_HOST = "0.0.0.0"
DATABASE_PORT = "5432"
DATABASE_USERNAME = "postgres"
DATABASE_PASSWORD = "hackme"
DATABASE_NAME = "rustore"
RECORD_MANAGER_DB_URL = f"postgresql://{DATABASE_USERNAME}:{DATABASE_PASSWORD}@{DATABASE_HOST}:{DATABASE_PORT}/{DATABASE_NAME}"
COLLECTION_NAME = "test_collection"


class SitemapLoaderWithChromium(SitemapLoader):
    def lazy_load(self) -> Iterator[Document]:
        """Load sitemap."""
        if self.is_local:
            try:
                import bs4
            except ImportError:
                raise ImportError(
                    "beautifulsoup4 package not found, please install it"
                    " with `pip install beautifulsoup4`"
                )
            fp = open(self.web_path)
            soup = bs4.BeautifulSoup(fp, "xml")
        else:
            soup = self._scrape(self.web_path, parser="xml")

        els = self.parse_sitemap(soup)

        results = self.scrape_all([el["loc"].strip() for el in els if "loc" in el])

        for i, result in enumerate(results):
            text_content = self.parsing_function(result, els[i]["loc"])
            yield Document(
                page_content=text_content,
                metadata=self.meta_function(els[i], result, text_content),
            )

    async def _fetch(
        self, url: str, retries: int = 3, cooldown: int = 2, backoff: float = 1.5
    ) -> str:
        """
        Asynchronously scrape the content of a given URL using Playwright's async API.

        Args:
            url (str): The URL to scrape.

        Returns:
            str: The scraped HTML content or an error message if an exception occurs.

        """
        from playwright.async_api import async_playwright

        logger.info("Starting scraping...")
        results = ""
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            try:
                page = await browser.new_page()
                await page.goto(url)
                results = await page.content()  # Simply get the HTML content
                logger.info("Content scraped")
            except Exception as e:
                results = f"Error: {e}"
            await browser.close()
        return results


def get_embeddings_model() -> Embeddings:
    return HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-small")


def split_docs_by_markdown(_docs: [Document]):
    from langchain_text_splitters import MarkdownHeaderTextSplitter

    headers_to_split_on = [("##", "header")]
    markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on, strip_headers=False)

    pattern = r"#[\w-]+"

    docs_to_return = []

    for doc in _docs:
        new_docs = markdown_splitter.split_text(doc.page_content)

        for _new_doc in new_docs:
            if _new_doc.metadata.get('header'):
                anchor = re.findall(pattern, _new_doc.metadata["header"])[0]
                _new_doc.metadata = doc.metadata | dict(source=f'{doc.metadata["source"]}/{anchor}')
                _new_doc.page_content = f'{_new_doc.metadata["crumbs"]}\n{_new_doc.page_content}'
                docs_to_return.append(_new_doc)

    return docs_to_return


def metadata_extractor(meta: dict, soup: BeautifulSoup, text_content: str) -> dict:
    title = soup.find("title")
    crumbs = text_content.split('\n')[0]
    description = soup.find("meta", attrs={"name": "description"})
    html = soup.find("html")
    return {
        "crumbs": crumbs,
        "source": meta["loc"],
        "title": title.get_text() if title else crumbs,
        "description": description.get("content", "") if description else "",
        "language": html.get("lang", "") if html else "",
        **meta,
    }


def load_rustore_docs():
    file_path = Path("./data/sitemap-help.xml").absolute()
    return SitemapLoaderWithChromium(
        file_path,
        is_local=True,
        filter_urls=["https://www.rustore.ru/help"],
        parsing_function=rustore_docs_extractor,
        default_parser="lxml",
        bs_kwargs={
            "parse_only": SoupStrainer(
                name=("article", "title", "html", "lang", "content")
            ),
        },
        meta_function=metadata_extractor,
        requests_per_second=1,
    ).load()


def simple_extractor(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    return re.sub(r"\n\n+", "\n\n", soup.text).strip()


def ingest_docs():
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=4000, chunk_overlap=200)
    embedding = get_embeddings_model()

    vectorstore = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embedding,
        persist_directory='./chroma_data'
    )

    record_manager = SQLRecordManager(
        f"chroma/{COLLECTION_NAME}", db_url=RECORD_MANAGER_DB_URL
    )
    record_manager.create_schema()

    docs_from_documentation = load_rustore_docs()
    logger.info(f"Loaded {len(docs_from_documentation)} docs from documentation")

    docs_transformed = split_docs_by_markdown(docs_from_documentation)
    docs_transformed = [doc for doc in docs_transformed if len(doc.page_content) > 10]

    for doc in docs_transformed:
        if "source" not in doc.metadata:
            doc.metadata["source"] = ""
        if "title" not in doc.metadata:
            doc.metadata["title"] = ""

    indexing_stats = index(
        docs_transformed,
        record_manager,
        vectorstore,
        cleanup="full",
        source_id_key="source",
        force_update=(os.environ.get("FORCE_UPDATE") or "false").lower() == "true",
    )

    logger.info(f"Indexing stats: {indexing_stats}")
    num_vecs = len(vectorstore)
    logger.info(
        f"LangChain now has this many vectors: {num_vecs}",
    )


if __name__ == "__main__":
    ingest_docs()
