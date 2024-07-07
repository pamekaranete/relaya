import React, { useState, useRef } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { emojisplosion } from "emojisplosion";
import * as DOMPurify from "dompurify";
import { SourceBubble, Source } from "./SourceBubble";
import {
  VStack,
  Flex,
  Heading,
  HStack,
  Box,
  Button,
  Divider,
  Spacer,
} from "@chakra-ui/react";
import { sendFeedback } from "../utils/sendFeedback";
import { apiBaseUrl } from "../utils/constants";
import { InlineCitation } from "./InlineCitation";

export type Message = {
  id: string;
  createdAt?: Date;
  content: string;
  role: "system" | "user" | "assistant" | "function";
  runId?: string;
  sources?: Source[];
  name?: string;
  function_call?: { name: string };
};

export type Feedback = {
  feedback_id: string;
  run_id: string;
  key: string;
  score: number;
  comment?: string;
};

const filterSources = (sources: Source[]) => {
  const filtered: Source[] = [];
  const urlMap = new Map<string, number>();
  const indexMap = new Map<number, number>();
  sources.forEach((source, i) => {
    const { url } = source;
    const index = urlMap.get(url);
    if (index === undefined) {
      urlMap.set(url, i);
      indexMap.set(i, filtered.length);
      filtered.push(source);
    } else {
      const resolvedIndex = indexMap.get(index);
      if (resolvedIndex !== undefined) {
        indexMap.set(i, resolvedIndex);
      }
    }
  });
  return { filtered, indexMap };
};

const createAnswerElements = (
    content: string,
    filteredSources: Source[],
    sourceIndexMap: Map<number, number>,
    highlighedSourceLinkStates: boolean[],
    setHighlightedSourceLinkStates: React.Dispatch<React.SetStateAction<boolean[]>>
) => {
  const matches = Array.from(content.matchAll(/\[\^?\$?{?(\d+)}?\^?\]/g));
  const elements: JSX.Element[] = [];
  let prevIndex = 0;

  const createCitation = (sourceNum: number, resolvedNum: number) => (
      <InlineCitation
          key={`citation:${prevIndex}`}
          source={filteredSources[resolvedNum]}
          sourceNumber={resolvedNum + 1}
          highlighted={highlighedSourceLinkStates[resolvedNum]}
          onMouseEnter={() =>
              setHighlightedSourceLinkStates((prevStates) =>
                  filteredSources.map((_, i) => i === resolvedNum)
              )
          }
          onMouseLeave={() =>
              setHighlightedSourceLinkStates((prevStates) =>
                  filteredSources.map(() => false)
              )
          }
      />
  );

  const processContent = (
      text: string,
      includeCitation: boolean = false,
      citationElement: JSX.Element | null = null
  ) => {
    const sanitizedHtml = DOMPurify.sanitize(text);
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitizedHtml, "text/html");

    const processNode = (node: Node): React.ReactNode => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const children = Array.from(element.childNodes).map(processNode);
        const ElementType = element.tagName.toLowerCase() as keyof JSX.IntrinsicElements;

        // Check if the current element is <li>
        if (ElementType === "li" && includeCitation && citationElement) {
          // Check if the last child is a string
          const lastChild = children[children.length - 1];
          if (typeof lastChild === "string") {
            // Trim trailing spaces
            const trimmedText = lastChild.trimEnd();
            // Check if it ends with punctuation
            const endsWithPunctuation = /[.!?]$/.test(trimmedText);
            // Append punctuation if not present
            children[children.length - 1] = endsWithPunctuation ? trimmedText : trimmedText + ".";
            // Add the citation element
            children.push(citationElement);
          } else {
            // Add the citation element
            children.push(citationElement);
          }
        }

        return <ElementType key={prevIndex++}>{children as any}</ElementType>;
      }
      return null;
    };

    return <>{Array.from(doc.body.childNodes).map(processNode)}</>;
  };

  matches.forEach((match) => {
    const sourceNum = parseInt(match[1], 10);
    const resolvedNum = sourceIndexMap.get(sourceNum) ?? 10;
    if (match.index !== null && resolvedNum < filteredSources.length) {
      const citationElement = createCitation(sourceNum, resolvedNum);
      elements.push(
          processContent(content.slice(prevIndex, match.index), true, citationElement)
      );
      prevIndex = (match?.index ?? 0) + match[0].length;
    }
  });

  if (prevIndex < content.length) {
    elements.push(processContent(content.slice(prevIndex)));
  }

  // Return the elements wrapped in a <ul> if all are <li> elements
  if (elements.every((el) => React.isValidElement(el))) {
    return <ul>{elements}</ul>;
  }

  return elements;
};

export function ChatMessageBubble(props: {
  message: Message;
  aiEmoji?: string;
  isMostRecent: boolean;
  messageCompleted: boolean;
}) {
  const { role, content, runId } = props.message;
  const isUser = role === "user";
  const [isLoading, setIsLoading] = useState(false);
  const [traceIsLoading, setTraceIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [comment, setComment] = useState("");
  const [feedbackColor, setFeedbackColor] = useState("");
  const upButtonRef = useRef(null);
  const downButtonRef = useRef(null);

  const cumulativeOffset = function (element: HTMLElement | null) {
    var top = 0,
        left = 0;
    do {
      top += element?.offsetTop || 0;
      left += element?.offsetLeft || 0;
      element = (element?.offsetParent as HTMLElement) || null;
    } while (element);

    return {
      top: top,
      left: left,
    };
  };

  const sendUserFeedback = async (score: number, key: string) => {
    let run_id = runId;
    if (run_id === undefined) {
      return;
    }
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      const data = await sendFeedback({
        score,
        runId: run_id,
        key,
        feedbackId: feedback?.feedback_id,
        comment,
        isExplicit: true,
      });
      if (data.code === 200) {
        setFeedback({ run_id, score, key, feedback_id: data.feedbackId });
        if (comment) {
          setComment("");
        }
      }
    } catch (e: any) {
      console.error("Error:", e);
      toast.error(e.message);
    }
    setIsLoading(false);
  };

  const viewTrace = async () => {
    try {
      setTraceIsLoading(true);
      const response = await fetch(apiBaseUrl + "/get_trace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_id: runId,
        }),
      });

      const data = await response.json();

      if (data.code === 400) {
        toast.error("Unable to view trace");
        throw new Error("Unable to view trace");
      } else {
        const url = data.replace(/['"]+/g, "");
        window.open(url, "_blank");
        setTraceIsLoading(false);
      }
    } catch (e: any) {
      console.error("Error:", e);
      setTraceIsLoading(false);
      toast.error(e.message);
    }
  };

  const sources = props.message.sources ?? [];
  const { filtered: filteredSources, indexMap: sourceIndexMap } =
      filterSources(sources);

  const [highlighedSourceLinkStates, setHighlightedSourceLinkStates] = useState(
      filteredSources.map(() => false)
  );
  const answerElements =
      role === "assistant"
          ? createAnswerElements(
              content,
              filteredSources,
              sourceIndexMap,
              highlighedSourceLinkStates,
              setHighlightedSourceLinkStates
          )
          : [];

  return (
      <VStack
          align="start"
          spacing={5}
          pb={5}
          width="100%"
          maxHeight="calc(100vh - 150px)"
          overflowY="auto"
      >
        {!isUser && (
            <Flex width="100%" justifyContent="space-between" alignItems="flex-start">
              <Box flex="1" pr={4} maxWidth="calc(100% - 270px)">
                <Heading fontSize="lg" fontWeight="medium" mb={2} color="#0078ff">
                  Ответ
                </Heading>
                <Box color="black" fontSize="md">
                  {answerElements}
                </Box>
              </Box>

              {filteredSources.length > 0 && (
                  <Box width="250px" position="sticky" top="0" alignSelf="flex-start">
                    <Heading fontSize="lg" fontWeight="medium" mb={2} color="#0078ff">
                      Источники
                    </Heading>
                    <Box maxHeight="400px" overflowY="auto" pr={2}>
                      <VStack align="start" spacing={2}>
                        {filteredSources.map((source, index) => (
                            <Box key={index} width="100%">
                              <SourceBubble
                                  source={source}
                                  highlighted={highlighedSourceLinkStates[index]}
                                  onMouseEnter={() =>
                                      setHighlightedSourceLinkStates((prevStates) =>
                                          filteredSources.map((_, i) => i === index)
                                      )
                                  }
                                  onMouseLeave={() =>
                                      setHighlightedSourceLinkStates((prevStates) =>
                                          filteredSources.map(() => false)
                                      )
                                  }
                                  runId={runId}
                              />
                            </Box>
                        ))}
                      </VStack>
                    </Box>
                  </Box>
              )}
            </Flex>
        )}

        {isUser && (
            <Heading fontWeight="medium" color="black" fontSize="3xl">
              {content}
            </Heading>
        )}

        {props.message.role !== "user" &&
            props.isMostRecent &&
            props.messageCompleted && (
                <HStack spacing={2} width="100%">
                  <Button
                      ref={upButtonRef}
                      size="sm"
                      variant="outline"
                      colorScheme={feedback === null ? "green" : "white"}
                      onClick={() => {
                        if (feedback === null && props.message.runId) {
                          sendUserFeedback(1, "user_score");
                          setFeedbackColor("border-4 border-green-300");
                        } else {
                          toast.error("Ответ уже был отправлен");
                        }
                      }}
                  >
                    Ответ верный
                  </Button>
                  <Button
                      ref={downButtonRef}
                      size="sm"
                      variant="outline"
                      colorScheme={feedback === null ? "red" : "gray"}
                      onClick={() => {
                        if (feedback === null && props.message.runId) {
                          sendUserFeedback(0, "user_score");
                          setFeedbackColor("border-4 border-red-300");
                        } else {
                          toast.error("Ответ уже был отправлен.");
                        }
                      }}
                  >
                    Ответ неверный
                  </Button>
                  <Spacer />
                  <Button
                      size="sm"
                      variant="outline"
                      colorScheme="blue"
                      onClick={(e) => {
                        e.preventDefault();
                        viewTrace();
                      }}
                      isLoading={traceIsLoading}
                      loadingText="🔄"
                      color="black"
                  >
                    View trace
                  </Button>
                </HStack>
            )}
        {!isUser && <Divider mt={4} mb={4} />}
      </VStack>
  );
}
