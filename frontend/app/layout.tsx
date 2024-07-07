import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import RuStore from "../public/images/RuStore.png"; // Ensure this path is correct

import Head from "next/head";
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "RuStore",
    description: "Chatbot for RuStore",

};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ru" className="h-full">
        <Head>
            <title>{metadata.title as any} </title>
        </Head>
        <body className={`${inter.className} h-full`}>
        <div
            className="flex flex-col h-full md:p-8"
            style={{ background: "rgb(255,255,255)" }}
        >
            {children}
        </div>
        </body>
        </html>
    );
}
