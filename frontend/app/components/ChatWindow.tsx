"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RemoteRunnable } from "@langchain/core/runnables/remote";
import { applyPatch } from "@langchain/core/utils/json_patch";
import RuStore from "../../public/images/RuStore.png";
import Image from "next/image";
import { EmptyState } from "./EmptyState";
import { ChatMessageBubble, Message } from "./ChatMessageBubble";
import { AutoResizeTextarea } from "./AutoResizeTextarea";
import { marked } from "marked";
import { Renderer } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/gradient-dark.css";
import "react-toastify/dist/ReactToastify.css";
import {
  Heading,
  Flex,
  IconButton,
  InputGroup,
  InputRightElement,
  Spinner, Box,
} from "@chakra-ui/react";
import { ArrowUpIcon } from "@chakra-ui/icons";
import { Select, Link } from "@chakra-ui/react";
import { Source } from "./SourceBubble";
import { apiBaseUrl } from "../utils/constants";

const MODEL_TYPES = [
  "openai_gpt_3_5_turbo",
  "anthropic_claude_3_haiku",
  "google_gemini_pro",
  "fireworks_mixtral",
  "cohere_command",
];

const defaultLlmValue =
    MODEL_TYPES[Math.floor(Math.random() * MODEL_TYPES.length)];

export function ChatWindow(props: { conversationId: string }) {
  const conversationId = props.conversationId;

  const searchParams = useSearchParams();

  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<Array<Message>>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [llm, setLlm] = useState(
      searchParams.get("llm") ?? "openai_gpt_3_5_turbo",
  );
  const [llmIsLoading, setLlmIsLoading] = useState(true);
  useEffect(() => {
    setLlm(searchParams.get("llm") ?? defaultLlmValue);
    setLlmIsLoading(false);
  }, []);

  const [chatHistory, setChatHistory] = useState<
      { human: string; ai: string }[]
  >([]);

  const sendMessage = async (message?: string) => {
    if (messageContainerRef.current) {
      messageContainerRef.current.classList.add("grow");
    }
    if (isLoading) {
      return;
    }
    const messageValue = message ?? input;
    if (messageValue === "") return;
    setInput("");
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Math.random().toString(), content: messageValue, role: "user" },
    ]);
    setIsLoading(true);

    let accumulatedMessage = "";
    let runId: string | undefined = undefined;
    let sources: Source[] | undefined = undefined;
    let messageIndex: number | null = null;

    try {
      const sourceStepName = "FindDocs";
      let streamedResponse: Record<string, any> = {};
      const remoteChain = new RemoteRunnable({
        url: apiBaseUrl + "/chat",
        options: {
          timeout: 60000,
        },
      });
      const llmDisplayName = llm ?? "openai_gpt_3_5_turbo";
      const streamLog = await remoteChain.streamLog(
          {
            question: messageValue,
            chat_history: chatHistory,
          },
          {
            configurable: {
              llm: llmDisplayName,
            },
            tags: ["model:" + llmDisplayName],
            metadata: {
              conversation_id: conversationId,
              llm: llmDisplayName,
            },
          },
          {
            includeNames: [sourceStepName],
          },
      );

      for await (const chunk of streamLog) {
        streamedResponse = applyPatch(streamedResponse, chunk.ops, undefined, false).newDocument;
        if (Array.isArray(streamedResponse?.logs?.[sourceStepName]?.final_output?.output)) {
          sources = streamedResponse.logs[sourceStepName].final_output.output.map((doc: Record<string, any>) => ({
            url: doc.metadata.source,
            title: doc.metadata.crumbs,
          }));
        }

        if (streamedResponse.id !== undefined) {
          runId = streamedResponse.id;
        }
        if (Array.isArray(streamedResponse?.streamed_output)) {
          accumulatedMessage = streamedResponse.streamed_output.join("");
        }
        const parsedResult = marked.parse(accumulatedMessage);

        setMessages((prevMessages) => {
          let newMessages = [...prevMessages];
          if (messageIndex === null || newMessages[messageIndex] === undefined) {
            messageIndex = newMessages.length;
            newMessages.push({
              id: Math.random().toString(),
              content: parsedResult.trim(),
              runId: runId,
              sources: sources,
              role: "assistant",
            });
          } else if (newMessages[messageIndex] !== undefined) {
            newMessages[messageIndex].content = parsedResult.trim();
            newMessages[messageIndex].runId = runId;
            newMessages[messageIndex].sources = sources;
          }
          return newMessages;
        });
      }

      setChatHistory((prevChatHistory) => [
        ...prevChatHistory,
        { human: messageValue, ai: accumulatedMessage },
      ]);
    } catch (error) {
      console.error("Error in sendMessage:", error);
      setMessages((prevMessages) => [
        ...prevMessages,
        {
          id: Math.random().toString(),
          content: "Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз позже.",
          role: "assistant",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendInitialQuestion = async (question: string) => {
    await sendMessage(question);
  };

  const insertUrlParam = (key: string, value?: string) => {
    if (window.history.pushState) {
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set(key, value ?? "");
      const newurl =
          window.location.protocol +
          "//" +
          window.location.host +
          window.location.pathname +
          "?" +
          searchParams.toString();
      window.history.pushState({ path: newurl }, "", newurl);
    }
  };

  return (
      <Box
          className="flex flex-col items-center justify-center"
          style={{
            fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            backgroundColor: '#ffffff',
            color: '#2d3748',
            minHeight: '100vh',
            padding: '20px'
          }}
      >
        <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            width="100%"
            maxWidth="1300px"
            height="90vh"
        >
          <Flex alignItems="center" mb={6}>
            <Image src={RuStore} alt="RuStore Icon" width={40} height={40} style={{marginRight: '12px'}} />
            <Heading
                fontSize="3xl"
                fontWeight="bold"
                color="#0078ff"
            >
              RuStore Chat
            </Heading>
          </Flex>

          {messages.length === 0 && (
              <Heading
                  fontSize="xl"
                  fontWeight="normal"
                  color="#4a5568"
                  textAlign="center"
                  mb={4}
              >
                Быстрые и правильные ответы по документации
                <Link
                    href="https://www.rustore.ru/help/"
                    className="ml-1 text-blue-600 hover:text-blue-800 transition duration-300"
                    style={{
                      textDecoration: 'none',
                      fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    }}
                    isExternal
                >
                  RuStore
                </Link>
              </Heading>
          )}

          <Box
              className="flex flex-col-reverse mb-6"
              ref={messageContainerRef}
              width="100%"
              p={4}
          >
            {messages.length > 0 ? (
                [...messages]
                    .reverse()
                    .map((m, index) => (
                        <ChatMessageBubble
                            key={m.id}
                            message={{ ...m }}
                            aiEmoji="🤖"
                            isMostRecent={index === 0}
                            messageCompleted={!isLoading}
                        />
                    ))
            ) : (
                <EmptyState onChoice={sendInitialQuestion} />
            )}
          </Box>

          <InputGroup size="lg" alignItems="center" width="100%" mb={4}>
            <AutoResizeTextarea
                value={input}
                maxRows={5}
                marginRight="56px"
                placeholder="Задайте ваш вопрос здесь..."
                textColor="#2d3748"
                borderColor="#e2e8f0"
                backgroundColor="white"
                _focus={{borderColor: "#2f83d5", boxShadow: "0 0 0 1px #3182ce"}}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  } else if (e.key === "Enter" && e.shiftKey) {
                    e.preventDefault();
                    setInput(input + "\n");
                  }
                }}
                style={{fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', fontSize: '16px'}}
            />
            <InputRightElement h="full">
              <IconButton
                  colorScheme="blue"
                  rounded="full"
                  aria-label="Send"
                  icon={isLoading ? <Spinner /> : <ArrowUpIcon />}
                  type="submit"
                  onClick={(e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
              />
            </InputRightElement>
          </InputGroup>
        </Flex>
      </Box>
  );
}




