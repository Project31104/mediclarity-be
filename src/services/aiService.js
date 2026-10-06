const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const generateMedicalSummary = async (medicalText) => {
    if (!medicalText || !medicalText.trim()) {
        throw new Error(
            "No medical report text available for summarization"
        );
    }

    const prompt = `
You are a medical document summarization assistant.

Analyze the medical report below and create a structured summary.

STRICT RULES:

1. Use ONLY information explicitly present in the report.
2. Do not invent or infer medical information.
3. Do not create diagnoses that are not explicitly stated.
4. Do not create medications that are not explicitly stated.
5. Do not provide medical advice.
6. Preserve exact test names, results, units and reference ranges.
7. Do not include empty or incomplete test entries.
8. Every test in "tests" MUST have a real test name.
9. Ignore page numbers, table headers, repeated column labels, footers,
   graphical elements and other document formatting artifacts.
10. If a section contains no relevant information, return [].
11. Do not summarize test results into key findings if the same information
    can be represented clearly in the tests section.
12. Return ONLY valid JSON.
13. Do NOT use Markdown.
14. Do NOT wrap the JSON in code fences.

Use EXACTLY this structure:

{
    "patientOverview": {
        "name": "",
        "age": "",
        "gender": "",
        "reportType": ""
    },

    "keyFindings": [],

    "diagnoses": [],

    "medications": [],

    "medicalHistory": [],

    "tests": [
        {
            "name": "",
            "result": "",
            "unit": "",
            "referenceRange": ""
        }
    ],

    "followUp": [],

    "importantNotes": []
}

IMPORTANT TEST RULES:

For every test:

"name":
The actual name of the laboratory test.

"result":
The actual reported numerical or textual result.

"unit":
The measurement unit exactly as written in the report.

"referenceRange":
The reference range exactly as written in the report.

Example:

{
    "name": "APOLIPOPROTEIN B (Apo B)",
    "result": "46.00",
    "unit": "mg/dL",
    "referenceRange": "46 - 174"
}

Another example:

{
    "name": "CARDIO C-REACTIVE PROTEIN (hsCRP)",
    "result": "1.00",
    "unit": "mg/L",
    "referenceRange": "<1.00"
}

If the report contains a test without a result because the result is pending,
you may include it only if the actual test name is clearly visible.

Do NOT create entries such as:

{
    "name": "Test",
    "result": ""
}

Do NOT create entries containing only:

"Test"

Do NOT include table headers as tests.

Medical Report:

${medicalText}
`;

    const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",

        contents: prompt,

        config: {
            responseMimeType: "application/json"
        }
    });

    let resultText = response.text;

    if (!resultText) {
        throw new Error(
            "Gemini returned an empty response"
        );
    }

    resultText = resultText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    let summary;

    try {
        summary = JSON.parse(resultText);
    } catch (error) {
        console.error(
            "Failed to parse Gemini JSON:",
            resultText
        );

        throw new Error(
            "AI returned an invalid summary format"
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Final cleanup
    |--------------------------------------------------------------------------
    |
    | Remove malformed test entries even if Gemini accidentally returns them.
    |
    */

    if (Array.isArray(summary.tests)) {
        summary.tests = summary.tests.filter((test) => {
            if (!test || typeof test !== "object") {
                return false;
            }

            const name = String(test.name || "").trim();

            if (!name) {
                return false;
            }

            const normalizedName = name.toLowerCase();

            // Remove generic table artifacts.
            if (
                normalizedName === "test" ||
                normalizedName === "tests" ||
                normalizedName === "result" ||
                normalizedName === "results" ||
                normalizedName === "unit" ||
                normalizedName === "reference range"
            ) {
                return false;
            }

            return true;
        });
    } else {
        summary.tests = [];
    }

    return summary;
};

module.exports = {
    generateMedicalSummary
};