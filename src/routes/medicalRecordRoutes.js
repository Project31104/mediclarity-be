const express = require("express");

const upload = require("../middleware/uploadMiddleware");

const {
    uploadMedicalRecord,
    getPatientMedicalRecords,
    deleteMedicalRecord,
    generateAISummary,
    viewMedicalRecordFile
} = require("../controllers/medicalRecordController");

const router = express.Router();

router.post(
    "/upload",
    upload.single("file"),
    uploadMedicalRecord
);

router.get(
    "/patient/:patientId",
    getPatientMedicalRecords
);

router.delete(
    "/:id",
    deleteMedicalRecord
);
router.get(
    "/:id/file",
    viewMedicalRecordFile
);
router.post("/:id/summarize", generateAISummary);
module.exports = router;