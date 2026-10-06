const mongoose = require("mongoose");

const medicalRecordSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },

    fileName: {
      type: String,
      required: true,
    },

    filePath: {
      type: String,
      required: true,
    },

    recordType: {
      type: String,
      enum: [
        "clinical_note",
        "psychiatric_report",
        "therapy_note",
        "prescription",
        "other",
      ],
      default: "other",
    },

    extractedText: {
      type: String,
      default: "",
    },

    wordCount: {
      type: Number,
      default: 0,
    },
    aiSummary: {
    type: mongoose.Schema.Types.Mixed,
    default: null
},

    summaryGeneratedAt: {
      type: Date,
      default: null,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("MedicalRecord", medicalRecordSchema);
