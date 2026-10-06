const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const { GoogleGenAI } = require("@google/genai");

// Gemini client
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const GEMINI_MODEL = "gemini-3.5-flash-lite";

/*
|--------------------------------------------------------------------------
| Clean extracted text
|--------------------------------------------------------------------------
*/

const cleanText = (text) => {
    if (!text) {
        return "";
    }

    return text
        // Remove null/control characters
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")

        // Replace non-breaking spaces
        .replace(/\u00A0/g, " ")

        // Normalize Windows/Mac line endings
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")

        // Remove excessive spaces
        .replace(/[ \t]+/g, " ")

        // Remove excessive blank lines
        .replace(/\n{3,}/g, "\n\n")

        .trim();
};


/*
|--------------------------------------------------------------------------
| Decode common custom PDF font encoding
|--------------------------------------------------------------------------
|
| Some PDFs store normal characters using Private Use Area Unicode
| characters. Example:
|
|   
|
| may actually represent:
|
|   Name
|
| This conversion handles the common F000-F0FF mapping.
|--------------------------------------------------------------------------
*/

const decodePrivateUseCharacters = (text) => {
    if (!text) {
        return "";
    }

    return text.replace(/[\uF000-\uF0FF]/g, (char) => {
        const code = char.charCodeAt(0) - 0xF000;

        // Convert to normal ASCII only when the resulting value
        // is a printable character.
        if (code >= 32 && code <= 126) {
            return String.fromCharCode(code);
        }

        return char;
    });
};


/*
|--------------------------------------------------------------------------
| Check whether locally extracted PDF text is trustworthy
|--------------------------------------------------------------------------
*/

const isTextReliable = (text) => {
    if (!text || !text.trim()) {
        return false;
    }

    const trimmed = text.trim();

    // Too little text usually means:
    // - scanned PDF
    // - image-only PDF
    // - extraction failure
    if (trimmed.length < 80) {
        return false;
    }

    // Private Use Area characters usually indicate
    // broken/custom PDF font encoding.
    const privateUseMatches =
        trimmed.match(/[\uE000-\uF8FF]/g) || [];

    const replacementMatches =
        trimmed.match(/\uFFFD/g) || [];

    const controlMatches =
        trimmed.match(/[\u0000-\u001F]/g) || [];

    const totalCharacters = trimmed.length;

    const privateUseRatio =
        privateUseMatches.length / totalCharacters;

    const replacementRatio =
        replacementMatches.length / totalCharacters;

    const controlRatio =
        controlMatches.length / totalCharacters;

    // If a significant amount of the document is corrupted,
    // use Gemini document understanding instead.
    if (privateUseRatio > 0.02) {
        return false;
    }

    if (replacementRatio > 0.01) {
        return false;
    }

    if (controlRatio > 0.01) {
        return false;
    }

    // Count readable letters/numbers.
    const readableCharacters =
        trimmed.match(/[A-Za-z0-9]/g) || [];

    const readableRatio =
        readableCharacters.length / totalCharacters;

    if (readableRatio < 0.20) {
        return false;
    }

    return true;
};


/*
|--------------------------------------------------------------------------
| Extract using local PDF parser
|--------------------------------------------------------------------------
*/

const extractPdfLocally = async (filePath) => {
    try {
        const fileBuffer = fs.readFileSync(filePath);

        const pdfData = await pdfParse(fileBuffer);

        let extractedText = pdfData.text || "";

        // First attempt to repair custom PDF font encoding.
        extractedText = decodePrivateUseCharacters(extractedText);

        extractedText = cleanText(extractedText);

        return extractedText;
    } catch (error) {
        console.error(
            "Local PDF extraction failed:",
            error.message
        );

        return "";
    }
};


/*
|--------------------------------------------------------------------------
| Gemini PDF extraction
|--------------------------------------------------------------------------
|
| This is the fallback for:
|
| - scanned PDFs
| - image-based PDFs
| - badly encoded PDFs
| - PDFs with tables/charts
| - PDFs where pdf-parse returns corrupted text
|--------------------------------------------------------------------------
*/

const extractPdfWithGemini = async (filePath) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error(
                "GEMINI_API_KEY is not configured"
            );
        }

        const fileBuffer = fs.readFileSync(filePath);

        const base64Pdf = fileBuffer.toString("base64");

        const prompt = `
You are a document extraction system.

Extract the COMPLETE readable text from this PDF.

This is a medical document, so accuracy is extremely important.

RULES:

1. Extract information exactly as it appears in the document.
2. Do NOT summarize the document.
3. Do NOT interpret medical information.
4. Do NOT diagnose the patient.
5. Do NOT add information that is not visible in the document.
6. Preserve:
   - patient names
   - dates
   - ages
   - gender
   - test names
   - test results
   - units
   - reference ranges
   - medication names
   - dosages
   - doctor names
   - diagnoses
   - recommendations
   - headings
   - tables
7. For tables, preserve the information in a clear text layout.
8. Read text from scanned/image-based pages using OCR.
9. Include text from every page.
10. If a word or value is genuinely impossible to read, write [unclear] rather than inventing it.
11. Do not provide a summary.
12. Do not use Markdown code blocks.

Return ONLY the extracted document text.
`;

        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,

            contents: [
                {
                    text: prompt
                },
                {
                    inlineData: {
                        mimeType: "application/pdf",
                        data: base64Pdf
                    }
                }
            ]
        });

        const extractedText = cleanText(
            response.text || ""
        );

        if (!extractedText) {
            throw new Error(
                "Gemini returned empty extracted text"
            );
        }

        return extractedText;

    } catch (error) {
        console.error(
            "Gemini PDF extraction failed:",
            error.message
        );

        throw new Error(
            `Unable to extract text from PDF: ${error.message}`
        );
    }
};


/*
|--------------------------------------------------------------------------
| Main extraction function
|--------------------------------------------------------------------------
*/

const extractTextFromFile = async (
    filePath,
    mimeType
) => {
    const extension = path
        .extname(filePath)
        .toLowerCase();

    /*
    |--------------------------------------------------------------------------
    | TXT FILE
    |--------------------------------------------------------------------------
    */

    if (
        extension === ".txt" ||
        mimeType === "text/plain"
    ) {
        const text = fs.readFileSync(
            filePath,
            "utf-8"
        );

        return cleanText(text);
    }


    /*
    |--------------------------------------------------------------------------
    | PDF FILE
    |--------------------------------------------------------------------------
    */

    if (
        extension === ".pdf" ||
        mimeType === "application/pdf"
    ) {
        console.log(
            "📄 Attempting local PDF text extraction..."
        );

        let extractedText =
            await extractPdfLocally(filePath);


        /*
        |--------------------------------------------------------------------------
        | LOCAL EXTRACTION SUCCESS
        |--------------------------------------------------------------------------
        */

        if (isTextReliable(extractedText)) {
            console.log(
                "✅ Local PDF extraction successful."
            );

            return extractedText;
        }


        /*
        |--------------------------------------------------------------------------
        | LOCAL EXTRACTION FAILED / CORRUPTED
        |--------------------------------------------------------------------------
        */

        console.log(
            "⚠️ Local PDF extraction unreliable."
        );

        console.log(
            "🤖 Switching to Gemini PDF document understanding..."
        );

        extractedText =
            await extractPdfWithGemini(filePath);


        /*
        |--------------------------------------------------------------------------
        | Validate Gemini result
        |--------------------------------------------------------------------------
        */

        if (!isTextReliable(extractedText)) {
            console.warn(
                "⚠️ Gemini returned text with low confidence."
            );
        }

        console.log(
            "✅ Gemini PDF extraction completed."
        );

        return extractedText;
    }


    /*
    |--------------------------------------------------------------------------
    | Unsupported file
    |--------------------------------------------------------------------------
    */

    throw new Error(
        "Unsupported file type. Please upload a PDF or TXT file."
    );
};


/*
|--------------------------------------------------------------------------
| Word count
|--------------------------------------------------------------------------
*/

const calculateWordCount = (text) => {
    if (!text || !text.trim()) {
        return 0;
    }

    return text
        .trim()
        .split(/\s+/)
        .length;
};


/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
    extractTextFromFile,
    calculateWordCount
};