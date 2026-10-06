const fs = require("fs");

const Patient = require("../models/Patient");
const MedicalRecord = require("../models/MedicalRecord");
const { generateMedicalSummary } = require("../services/aiService");

const {
  extractTextFromFile,
  calculateWordCount,
} = require("../services/textExtractionService");

const uploadMedicalRecord = async (req, res) => {
    try {
        const { patientId, recordType } = req.body;

        // Check patient ID
        if (!patientId) {
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }

            return res.status(400).json({
                success: false,
                message: "Patient ID is required"
            });
        }

        // Check file
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please upload a PDF or TXT file"
            });
        }

        // Check patient exists
        const patient = await Patient.findById(patientId);

        if (!patient) {
            fs.unlinkSync(req.file.path);

            return res.status(404).json({
                success: false,
                message: "Patient not found"
            });
        }

        // Extract text from uploaded file
        const extractedText = await extractTextFromFile(
            req.file.path,
            req.file.mimetype
        );

        // Check extracted text
        if (!extractedText || !extractedText.trim()) {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.status(400).json({
                success: false,
                message: "Could not extract readable text from the medical report"
            });
        }

        // Calculate word count
        const wordCount = calculateWordCount(extractedText);

        // Create medical record first
        const medicalRecord = await MedicalRecord.create({
            patientId: patient._id,
            fileName: req.file.originalname,
            filePath: req.file.path,
            recordType: recordType || "other",
            extractedText,
            wordCount
        });

        // Generate AI summary immediately
        try {
            const summary = await generateMedicalSummary(extractedText);

            medicalRecord.aiSummary = summary;
            medicalRecord.summaryGeneratedAt = new Date();

            await medicalRecord.save();

        } catch (aiError) {
            console.error("AI summary generation error:", aiError);

            // Keep the uploaded record even if AI summarization fails
            return res.status(201).json({
                success: true,
                message: "Medical report uploaded, but AI summary could not be generated.",
                summaryGenerated: false,
                medicalRecord
            });
        }

        res.status(201).json({
            success: true,
            message: "Medical report uploaded and AI summary generated successfully.",
            summaryGenerated: true,
            medicalRecord
        });

    } catch (error) {
        console.error("Upload medical record error:", error);

        // Delete uploaded file if processing failed
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: "Failed to process medical record",
            error: error.message
        });
    }
};

const getPatientMedicalRecords = async (req, res) => {
  try {
    const { patientId } = req.params;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    const records = await MedicalRecord.find({ patientId }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: records.length,
      records,
    });
  } catch (error) {
    console.error("Get medical records error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch medical records",
    });
  }
};
const viewMedicalRecordFile = async (req, res) => {
    try {
        const { id } = req.params;

        const medicalRecord = await MedicalRecord.findById(id);

        if (!medicalRecord) {
            return res.status(404).json({
                success: false,
                message: "Medical record not found"
            });
        }

        if (!fs.existsSync(medicalRecord.filePath)) {
            return res.status(404).json({
                success: false,
                message: "Original medical file no longer exists"
            });
        }

        res.sendFile(medicalRecord.filePath, {
            headers: {
                "Content-Disposition": `inline; filename="${medicalRecord.fileName}"`
            }
        });

    } catch (error) {
        console.error("View medical record file error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to open medical record file"
        });
    }
};
const deleteMedicalRecord = async (req, res) => {
  try {
    const { id } = req.params;

    const medicalRecord = await MedicalRecord.findById(id);

    if (!medicalRecord) {
      return res.status(404).json({
        success: false,
        message: "Medical record not found",
      });
    }

    // Delete the physical file
    if (medicalRecord.filePath && fs.existsSync(medicalRecord.filePath)) {
      fs.unlinkSync(medicalRecord.filePath);
    }

    // Delete the MongoDB record
    await MedicalRecord.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Medical record deleted successfully",
    });
  } catch (error) {
    console.error("Delete medical record error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete medical record",
    });
  }
};
const generateAISummary = async (req, res) => {
    try {
        const { id } = req.params;

        const medicalRecord = await MedicalRecord.findById(id);

        if (!medicalRecord) {
            return res.status(404).json({
                success: false,
                message: "Medical record not found"
            });
        }

        if (!medicalRecord.extractedText || !medicalRecord.extractedText.trim()) {
            return res.status(400).json({
                success: false,
                message: "No extracted text available for this medical record"
            });
        }

        const summary = await generateMedicalSummary(
            medicalRecord.extractedText
        );

        medicalRecord.aiSummary = summary;
        medicalRecord.summaryGeneratedAt = new Date();

        await medicalRecord.save();

        res.status(200).json({
            success: true,
            message: "AI summary generated successfully",
            summary: medicalRecord.aiSummary,
            summaryGeneratedAt: medicalRecord.summaryGeneratedAt
        });

    } catch (error) {
        console.error("Generate AI summary error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to generate AI summary",
            error: error.message
        });
    }
};
module.exports = {
    uploadMedicalRecord,
    getPatientMedicalRecords,
    deleteMedicalRecord,
    generateAISummary,
    viewMedicalRecordFile
};