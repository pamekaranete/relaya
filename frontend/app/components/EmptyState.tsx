import { MouseEvent } from "react";
import {
  Heading,
  Link,
  Card,
  CardHeader,
  Flex,
  Spacer, Box,
} from "@chakra-ui/react";

export function EmptyState(props: { onChoice: (question: string) => any }) {
  const handleClick = (e: MouseEvent) => {
    props.onChoice((e.target as HTMLDivElement).innerText);
  };
    return (
        <Box className="rounded max-w-full"  display="flex" justifyContent="center">
            <Flex direction="row" justifyContent="center" alignItems="center" gap="4" maxWidth="1400px" >
                {[
                    "Что такое chargeback?",
                    "Почему сумма по возвратам отображается как 0 руб.?",
                    "Что делать, если меняются данные Компании, адрес, реквизиты или email?",
                    "Можно ли создать несколько товаров с одинаковым idо?",
                    "Можно ли создать один товар с двумя ido?"
                ].map((question, index) => (
                    <Card
                        key={index}
                        onMouseUp={handleClick}
                        width="180px"
                        height="120px"
                        backgroundColor="white"
                        _hover={{ backgroundColor: "rgb(196,196,203)" }}
                        cursor="pointer"
                        justifyContent="center"
                        flexShrink={0}
                        border="1px solid gray"
                    >
                        <CardHeader justifyContent="center" padding="3" >
                            <Heading
                                fontSize="xs"
                                fontWeight="medium"
                                color="gray"
                                textAlign="center"
                            >
                                {question}
                            </Heading>
                        </CardHeader>
                    </Card>
                ))}
            </Flex>
        </Box>
    );
}
