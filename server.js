const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bcrypt = require("bcrypt");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const path = require("path");
const dbPath = path.join(__dirname, "backend.db");
const db = new sqlite3.Database(dbPath, (err) => {
	if (err) {
		console.error(err.message);
	} else {
		console.log("Connected to the SQLite database.");
	}
});

app.get("/", (req, res) => {
	res.send("Development server is running!");
});

// Create a user
app.post("/register", async (req, res) => {
	const { username, email, password } = req.body;

	try {
		// Hash the password
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(password, salt);

		// Insert the user into the database
		db.run(
			"INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
			[username, email, hashedPassword],
			function (err) {
				if (err) {
					if (err.code === "SQLITE_CONSTRAINT") {
						res.status(400).json({ error: "Username or email already exists" });
					} else {
						res.status(500).json({ error: "Database error" });
					}
					return;
				}
				res.status(201).json({ message: "User registered successfully" });
			}
		);
	} catch (error) {
		res.status(500).json({ error: "Server error" });
	}
});

// Login endpoint
app.post("/login", (req, res) => {
	const { identifier, password } = req.body;
	console.log(
		"Received login request with identifier:",
		identifier,
		"and password:",
		password
	);

	db.get(
		"SELECT * FROM users WHERE email = ? OR username = ?",
		[identifier, identifier],
		(err, row) => {
			if (err) {
				console.error("Database error:", err);
				res.status(500).json({ error: "Internal server error" });
				return;
			}
			if (!row) {
				console.log("No user found with identifier:", identifier);
				res.status(401).json({ error: "Invalid credentials" });
				return;
			}

			console.log("User found:", row);

			// Check if the password matches the stored hash
			bcrypt.compare(password, row.password_hash, (err, result) => {
				if (err) {
					console.error("Error comparing passwords:", err);
					res.status(500).json({ error: "Internal server error" });
					return;
				}
				if (!result) {
					console.log("Password does not match for user:", identifier);
					res.status(401).json({ error: "Invalid credentials" });
					return;
				}
				console.log("Login successful for user:", identifier);
				res.status(200).json({ message: "Login successful" });
			});
		}
	);
});

// GET endpoint to retrieve all products
app.get("/products", (req, res) => {
	db.all("SELECT * FROM products", [], (err, rows) => {
		if (err) {
			res.status(500).json({ error: err.message });
			return;
		}
		res.json(rows);
	});
});

// POST endpoint to add a new product
app.post("/products", (req, res) => {
	const { name, description, price, category, image_url } = req.body;
	db.run(
		"INSERT INTO products (name, description, price, category, image_url) VALUES (?, ?, ?, ?, ?)",
		[name, description, price, category, image_url],
		function (err) {
			if (err) {
				res.status(500).json({ error: err.message });
				return;
			}
			res.json({
				id: this.lastID,
				name,
				description,
				price,
				category,
				image_url,
			});
		}
	);
});

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
