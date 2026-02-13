const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// In-memory database (temporary for hackathon)
let drugs = [];

// 1️⃣ Add Drug API
app.post('/add-drug', (req, res) => {
    const { name, batch, expiry } = req.body;

    if (!name || !batch || !expiry) {
        return res.status(400).json({ message: "All fields required" });
    }

    const newDrug = { name, batch, expiry };
    drugs.push(newDrug);

    res.json({ message: "Drug added successfully", drug: newDrug });
});

// 2️⃣ View All Drugs API
app.get('/drugs', (req, res) => {
    res.json(drugs);
});

// 3️⃣ Verify Drug API
app.post('/verify-drug', (req, res) => {
    const { batch } = req.body;

    const found = drugs.find(d => d.batch === batch);

    if (found) {
        res.json({ status: "Authentic", drug: found });
    } else {
        res.json({ status: "Fake or Not Found" });
    }
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
