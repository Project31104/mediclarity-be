const Patient = require("../models/Patient");

// Create a patient
const createPatient = async (req, res) => {
    try {
        const { name, age, gender, contact, medicalHistory } = req.body;

        if (!name || !age || !gender) {
            return res.status(400).json({
                success: false,
                message: "Name, age and gender are required"
            });
        }

        const patientCount = await Patient.countDocuments();

        const patientId = `MH${String(patientCount + 1).padStart(5, "0")}`;

        const patient = await Patient.create({
            patientId,
            name,
            age,
            gender,
            contact,
            medicalHistory
        });

        res.status(201).json({
            success: true,
            message: "Patient created successfully",
            patient
        });

    } catch (error) {
        console.error("Create patient error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create patient"
        });
    }
};


// Get all patients
const getPatients = async (req, res) => {
    try {
        const patients = await Patient.find()
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: patients.length,
            patients
        });

    } catch (error) {
        console.error("Get patients error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch patients"
        });
    }
};


// Get single patient
const getPatient = async (req, res) => {
    try {
        const patient = await Patient.findById(req.params.id);

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: "Patient not found"
            });
        }

        res.status(200).json({
            success: true,
            patient
        });

    } catch (error) {
        console.error("Get patient error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch patient"
        });
    }
};


// Update patient
const updatePatient = async (req, res) => {
    try {
        const patient = await Patient.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: "Patient not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Patient updated successfully",
            patient
        });

    } catch (error) {
        console.error("Update patient error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update patient"
        });
    }
};


// Delete patient
const deletePatient = async (req, res) => {
    try {
        const patient = await Patient.findByIdAndDelete(req.params.id);

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: "Patient not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Patient deleted successfully"
        });

    } catch (error) {
        console.error("Delete patient error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete patient"
        });
    }
};


module.exports = {
    createPatient,
    getPatients,
    getPatient,
    updatePatient,
    deletePatient
};