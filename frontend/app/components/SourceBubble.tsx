import React from "react";
import { Card, CardBody, Heading } from "@chakra-ui/react";
import { sendFeedback } from "../utils/sendFeedback";

export type Source = {
    url: string;
    title: string;
};

export function SourceBubble({
                                 source,
                                 highlighted,
                                 onMouseEnter,
                                 onMouseLeave,
                                 runId,
                             }: {
    source: Source;
    highlighted: boolean;
    onMouseEnter: () => any;
    onMouseLeave: () => any;
    runId?: string;
}) {
    // Splitting the title into parts
    const parts = source.title.split(" | ");
    const parts1 = source.url.split("#");
    return (
        <Card
            onClick={async () => {
                window.open(source.url, "_blank");
                if (runId) {
                    await sendFeedback({
                        key: "user_click",
                        runId,
                        value: source.url,
                        isExplicit: false,
                    });
                }
            }}
            backgroundColor="white"


            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            cursor="pointer"
            alignSelf="stretch"
            height="100%"
            overflow="hidden"
        >
            <CardBody>
                <Heading fontSize="small" fontWeight="normal" color="gray" pb={2}>
                    {parts[0]} {/* Render the first part separately */}
                </Heading>
                <Heading color="blue" fontWeight="normal" fontSize="medium" pb={1}>
                    {parts1[1]}
                </Heading>
                <Heading color="black" fontWeight="light" fontSize="medium" >
                    {parts.slice(1).join(" | ")} {/* Render all other parts joined together */}
                </Heading>
            </CardBody>
        </Card>
    );
}
//sdfsdf
