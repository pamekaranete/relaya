import re
from typing import Generator
from bs4 import BeautifulSoup, Tag, NavigableString, Doctype
from urllib.parse import urljoin


def get_first_breadcrumb(url: str) -> str:
    if url.startswith("https://www.rustore.ru/help/sdk/"):
        return "Документация SDK"
    elif url.startswith("https://www.rustore.ru/help/users/"):
        return "Документация пользователей"
    elif url.startswith("https://www.rustore.ru/help/developers/"):
        return "Документация разработчиков"
    elif url.startswith("https://www.rustore.ru/help/work-with-rustore-api/"):
        return "Документация API"
    elif url.startswith("https://www.rustore.ru/help/guides/"):
        return "Сценария использования"
    else:
        return "Документация RuStore"


def rustore_docs_extractor(soup: BeautifulSoup, base_url: str) -> str:
    # Remove all the tags that are not meaningful for the extraction.
    SCAPE_TAGS = ["footer", "aside", "script", "style"]
    [tag.decompose() for tag in soup.find_all(SCAPE_TAGS)]

    def get_text(tag: Tag) -> Generator[str, None, None]:
        for child in tag.children:
            if isinstance(child, Doctype):
                continue

            if isinstance(child, NavigableString):
                text = child.string
                # Remove NUL and ZWSP characters
                text = text.replace('\u0000', '').replace('\u200B', '')
                yield text
            elif isinstance(child, Tag):
                if child.name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
                    heading_id = child.get('id', '')
                    heading_text = child.get_text(strip=True)
                    if heading_id:
                        yield f"{'#' * int(child.name[1:])} [#{heading_id}] {heading_text}\n\n"
                    else:
                        yield f"{'#' * int(child.name[1:])} {heading_text}\n\n"
                elif child.name == "a":
                    href = child.get('href', '')
                    if href.startswith("http"):
                        yield f"[{child.get_text(strip=True)}]({href})"
                    else:
                        yield child.get_text(strip=True)
                elif child.name == "img":
                    src = child.get("src", "")
                    alt = child.get("alt", "")
                    class_name = child.get("class", [])
                    class_str = f" class=\"{' '.join(class_name)}\"" if class_name else ""

                    if src.startswith("data:image"):
                        yield f"<img src=\"{src}\" alt=\"{alt}\"{class_str}>\n\n"
                    else:
                        full_src = urljoin(base_url, src)
                        yield f"<img src=\"{full_src}\" alt=\"{alt}\"{class_str}>\n\n"
                elif child.name in ["strong", "b"]:
                    yield f"**{child.get_text(strip=True)}**"
                elif child.name in ["em", "i"]:
                    yield f"_{child.get_text(strip=True)}_"
                elif child.name == "br":
                    yield "\n"
                elif child.name == "code":
                    parent = child.find_parent()
                    if parent is not None and parent.name == "pre":
                        classes = parent.attrs.get("class", "")

                        language = next(
                            filter(lambda x: re.match(r"language-\w+", x), classes),
                            None,
                        )
                        if language is None:
                            language = ""
                        else:
                            language = language.split("-")[1]

                        lines: list[str] = []
                        for span in child.find_all("span", class_="token-line"):
                            line_content = "".join(
                                token.get_text() for token in span.find_all("span")
                            )
                            lines.append(line_content)

                        code_content = "\n".join(lines)
                        yield f"```{language}\n{code_content}\n```\n\n"
                    else:
                        yield f"`{child.get_text(strip=True)}`"
                elif child.name == "p":
                    yield from get_text(child)
                    yield "\n\n"
                elif child.name == "ul":
                    for li in child.find_all("li", recursive=False):
                        yield "- "
                        yield from get_text(li)
                        yield "\n\n"
                elif child.name == "ol":
                    yield "\n"
                    for i, li in enumerate(child.find_all("li", recursive=False), 1):
                        yield f"{i}. "
                        li_content = "".join(get_text(li)).strip()
                        yield f"{li_content}\n"
                    yield "\n"
                elif child.name == "div" and "tabs-container" in child.attrs.get(
                        "class", [""]
                ):
                    tabs = child.find_all("li", {"role": "tab"})
                    tab_panels = child.find_all("div", {"role": "tabpanel"})
                    for tab, tab_panel in zip(tabs, tab_panels):
                        tab_name = tab.get_text(strip=True)
                        yield f"{tab_name}\n"
                        yield from get_text(tab_panel)
                elif child.name == "table":
                    thead = child.find("thead")
                    header_exists = isinstance(thead, Tag)
                    if header_exists:
                        headers = thead.find_all("th")
                        if headers:
                            yield "| "
                            yield " | ".join(header.get_text(strip=True) for header in headers)
                            yield " |\n"
                            yield "| "
                            yield " | ".join("----" for _ in headers)
                            yield " |\n"

                    tbody = child.find("tbody")
                    tbody_exists = isinstance(tbody, Tag)
                    if tbody_exists:
                        for row in tbody.find_all("tr"):
                            yield "| "
                            yield " | ".join(
                                cell.get_text(strip=True).replace("\n", " ") for cell in row.find_all("td")
                            )
                            yield " |\n"

                    yield "\n\n"
                elif child.name == "div" and "theme-admonition" in child.attrs.get("class", []):
                    admonition_type = child.find(class_="admonitionHeading_Gvgb")
                    admonition_content = child.find(class_="admonitionContent_BuS1")
                    if admonition_type and admonition_content:
                        yield f"\n[{admonition_type.get_text(strip=True)}] "
                        yield from get_text(admonition_content)
                        yield "\n\n"
                elif child.name in ["button"]:
                    continue
                else:
                    yield from get_text(child)

    # Extract breadcrumbs
    breadcrumbs = []
    breadcrumbs_nav = soup.find("nav", class_="theme-doc-breadcrumbs")
    if breadcrumbs_nav:
        first_breadcrumb = get_first_breadcrumb(base_url)
        breadcrumbs.append(first_breadcrumb)

        for item in breadcrumbs_nav.find_all("li", class_="breadcrumbs__item"):
            link = item.find("a", class_="breadcrumbs__link")
            if link:
                text = link.get_text(strip=True)
            else:
                text = item.get_text(strip=True)

            if text and text != "Главная страница":
                if re.match(r'^\d+(\.\d+)*$', text):
                    text = f"[версия] {text}"
                breadcrumbs.append(text)

    breadcrumbs_str = " | ".join(breadcrumbs)

    # Find the article tag
    article = soup.find("article")
    if not article:
        return "Could not find article content."

    # Remove breadcrumbs from the article content
    breadcrumbs_in_article = article.find("nav", class_="theme-doc-breadcrumbs")
    if breadcrumbs_in_article:
        breadcrumbs_in_article.decompose()

    content = "".join(get_text(article))

    # Combine breadcrumbs and content
    full_content = f"{breadcrumbs_str}\n\n{content}"

    return re.sub(r"\n\n+", "\n\n", full_content).strip()
