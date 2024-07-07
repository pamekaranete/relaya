import { Source } from "./SourceBubble";
import { Link } from "@chakra-ui/react";
import React from "react";

export function InlineCitation(props: {
    source: Source;
    sourceNumber: number;
    highlighted: boolean;
    onMouseEnter: () => any;
    onMouseLeave: () => any;
}) {
    const { source, sourceNumber, highlighted, onMouseEnter, onMouseLeave } =
        props;
    return (
        <Link
            href={source.url}
            isExternal
            color="#2c5282" // Синий цвет
            fontWeight="medium"
            fontSize="xs"
            position="relative"
            bottom="1.5"
            px="1"
            borderRadius="sm"
            backgroundColor={highlighted ? "blue.100" : "transparent"}
            _hover={{
                textDecoration: "underline",
                backgroundColor: "blue.50",
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            whiteSpace="nowrap" // Для предотвращения переноса на новую строку
            display="inline-block" // Используем inline-block вместо inline
        >
            [{sourceNumber}]
        </Link>
    );
}
