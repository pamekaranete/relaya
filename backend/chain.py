import os
from operator import itemgetter
from typing import Dict, List, Optional, Sequence

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import LLMChainFilter
from langchain_fireworks import ChatFireworks

from ingest import get_embeddings_model
from langchain_community.chat_models import ChatOllama
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_core.language_models import LanguageModelLike
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import (
    ChatPromptTemplate,
    MessagesPlaceholder,
    PromptTemplate,
)
from langchain_core.pydantic_v1 import BaseModel
from langchain_core.retrievers import BaseRetriever
from langchain_core.runnables import (
    ConfigurableField,
    Runnable,
    RunnableBranch,
    RunnableLambda,
    RunnablePassthrough,
    RunnableSequence,
    chain,
)


RESPONSE_TEMPLATE = """\
Вы - опытный программист и специалист по решению проблем, которому поручено отвечать на любые вопросы о Rustore.

Сформулируйте исчерпывающий и информативный ответ объемом не более 80 слов на заданный вопрос, \
основываясь исключительно на предоставленных результатах поиска (URL и содержание). \
Вы должны использовать только информацию из предоставленных результатов поиска. \
Используйте непредвзятый и журналистский тон. Объедините результаты поиска в связный ответ. \
Не повторяйте текст. Цитируйте результаты поиска, используя обозначение [${{number}}]. \
Цитируйте только наиболее релевантные результаты, которые точно отвечают на вопрос. \
Размещайте эти цитаты в конце предложения или абзаца, на которые они ссылаются - не помещайте их все в конец. \
Если разные результаты относятся к разным объектам с \
одинаковым названием, напишите отдельные ответы для каждого объекта.

Для удобства чтения используйте в своем ответе маркированные списки. \
Размещайте цитаты там, где они применимы, а не все в конце.

Если в контексте нет ничего релевантного заданному вопросу, \
просто скажите "Хмм, я не уверен." Не пытайтесь придумать ответ.

Если вопрос по коду, то можешь попытаться на него ответить.

Всё, что находится между следующими html-блоками `context`, извлечено \
из базы знаний и не является частью разговора с пользователем.

<context>
    {context} 
<context/>

ПОМНИТЕ: Если в контексте нет релевантной информации, просто скажите "Хмм, я не уверен. Но если вопрос по коду и это простая ошибка, помоги пользователю."\
Не пытайтесь придумать ответ. Всё, что находится между предшествующими html-блоками 'context', \
извлечено из базы знаний и не является частью разговора с пользователем. \
Цитируйте результаты поиска, используя обозначение [${{number}}], где number - это doc id\
"""

REPHRASE_TEMPLATE = """\
Учитывая следующий диалог и дополнительный вопрос, перефразируйте дополнительный \
вопрос так, чтобы он стал самостоятельным вопросом.

История чата:
{chat_history}
Дополнительный вопрос: {question}
Самостоятельный вопрос:"""


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


COLLECTION_NAME = "test_collection"


class ChatRequest(BaseModel):
    question: str
    chat_history: Optional[List[Dict[str, str]]]


def get_retriever(_llm) -> BaseRetriever:
    vectorstore = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=get_embeddings_model(),
        persist_directory='./chroma_data'
    )
    _retriever = vectorstore.as_retriever(search_kwargs=dict(k=6))
    compressor = LLMChainFilter.from_llm(_llm)
    compression_retriever = ContextualCompressionRetriever(
        base_compressor=compressor, base_retriever=_retriever
    )
    return compression_retriever


def create_retriever_chain(
    llm: LanguageModelLike, retriever: BaseRetriever
) -> Runnable:
    CONDENSE_QUESTION_PROMPT = PromptTemplate.from_template(REPHRASE_TEMPLATE)
    condense_question_chain = (
        CONDENSE_QUESTION_PROMPT | llm | StrOutputParser()
    ).with_config(
        run_name="CondenseQuestion",
    )
    conversation_chain = condense_question_chain | retriever
    return RunnableBranch(
        (
            RunnableLambda(lambda x: bool(x.get("chat_history"))).with_config(
                run_name="HasChatHistoryCheck"
            ),
            conversation_chain.with_config(run_name="RetrievalChainWithHistory"),
        ),
        (
            RunnableLambda(itemgetter("question")).with_config(
                run_name="Itemgetter:question"
            )
            | retriever
        ).with_config(run_name="RetrievalChainWithNoHistory"),
    ).with_config(run_name="RouteDependingOnChatHistory")


def format_docs(docs: Sequence[Document]) -> str:
    formatted_docs = []
    for i, doc in enumerate(docs):
        doc_string = f"<doc id='{i}'>{doc.page_content}</doc>"
        formatted_docs.append(doc_string)
    return "\n".join(formatted_docs)


def serialize_history(request: ChatRequest):
    chat_history = request["chat_history"] or []
    converted_chat_history = []
    for message in chat_history:
        if message.get("human") is not None:
            converted_chat_history.append(HumanMessage(content=message["human"]))
        if message.get("ai") is not None:
            converted_chat_history.append(AIMessage(content=message["ai"]))
    return converted_chat_history


def create_chain(llm: LanguageModelLike, retriever: BaseRetriever) -> Runnable:
    retriever_chain = create_retriever_chain(
        llm,
        retriever,
    ).with_config(run_name="FindDocs")
    context = (
        RunnablePassthrough.assign(docs=retriever_chain)
        .assign(context=lambda x: format_docs(x["docs"]))
        .with_config(run_name="RetrieveDocs")
    )
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", RESPONSE_TEMPLATE),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{question}"),
        ]
    )
    default_response_synthesizer = prompt | llm

    response_synthesizer = (
        default_response_synthesizer
        | StrOutputParser()
    ).with_config(run_name="GenerateResponse")
    return (
        RunnablePassthrough.assign(chat_history=serialize_history)
        | context
        | response_synthesizer
    )


# llm = ChatOllama(model='mixtral:8x22b-text-v0.1-q4_1', base_url='http://10.0.24.132:11434')
llm = ChatFireworks(
    model="accounts/fireworks/models/mixtral-8x22b-instruct",
    temperature=0,
)

retriever = get_retriever(llm)
answer_chain = create_chain(llm, retriever)
