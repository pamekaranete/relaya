# Чат RuStore

Этот репозиторий представляет собой реализацию локально размещенного чат-бота, специально ориентированного на ответы на вопросы по [документации RuStore](https://python.langchain.com/).
Построен с использованием [LangChain](https://github.com/langchain-ai/langchain/), [FastAPI](https://fastapi.tiangolo.com/) и [Next.js](https://nextjs.org).

Приложение использует поддержку потоковой передачи LangChain и асинхронный API для обновления страницы в реальном времени для нескольких пользователей.

## Запуск локально
1. Установите зависимости бэкенда: `poetry install`.
2. Убедитесь, что вы ввели переменные окружения для настройки приложения:
```
# для работы с удаленной ллм (данный сервис взят для примера)
export FIREWORKS_API_KEY=

# для трассировки
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"
export LANGCHAIN_API_KEY=
export LANGCHAIN_PROJECT=
```
3. Для запуска локальной llm потребуется [ollama](https://ollama.com/). В проекте используется [aya:35b](https://ollama.com/library/aya:35b)
Запуск с помощью команды:
```shell
ollama run aya:35b
```
4. Запустите 
```shell
docker compose -f docker-compose.yml up -d
```
для того, чтобы поднять бд posgtres (используется для логирования)
5. Запустите `python backend/ingest.py` для загрузки данных документации RuStore в векторное хранилище Chroma (нужно сделать только один раз).
   1. Предусмотрен процесс обновления, для обновления запустите скрипт повторно (логи обновления записываются в postgres).
6. Запустите бэкенд Python с помощью `make start`.
7. Установите зависимости фронтенда, выполнив `cd ./frontend`, затем `yarn`.
8. Запустите фронтенд с помощью `yarn dev`.
9. Откройте [localhost:3000](http://localhost:3000) в вашем браузере.

## Техническое описание

Есть два компонента: загрузка и ответы на вопросы.

Процесс загрузки состоит из следующих шагов:

1. Извлечение html с сайта документации.
2. Загрузка html с помощью [SitemapLoader](https://python.langchain.com/docs/integrations/document_loaders/sitemap) от LangChain
3. Разделение документов с помощью [MarkdownHeaderTextSplitter](https://python.langchain.com/v0.2/docs/how_to/markdown_header_metadata_splitter/) от LangChain
4. Создание векторного хранилища эмбеддингов с использованием [ChromaDB](https://python.langchain.com/docs/integrations/vectorstores/chroma) (с эмбеддингами [intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small)).

Процесс ответов на вопросы состоит из следующих шагов:

1. На основе истории чата и нового ввода пользователя определяется, каким был бы отдельный вопрос, используя llm.
2. На основе этого отдельного вопроса осуществляется поиск релевантных документов в векторном хранилище.
4. Отдельный вопрос и подобранные документы, передаются в llm для отсеивания нерелевантных. 
5. Отдельный вопрос и отфильтрованные документы передаются модели для генерации и потоковой передачи окончательного ответа.
6. Генерируется URL трассировки для текущей сессии чата, а также конечная точка для сбора обратной связи.
