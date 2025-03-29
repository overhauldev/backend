const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = 5000;
const SECRET_KEY = process.env.SECRET_KEY;

app.use(cors());
app.use(express.json());

const path = require("path");
const dbPath = path.join(__dirname, "backend.db");
const db = new sqlite3.Database(dbPath, (err) => {
	if (err) {
		console.error("Database connection error:", err.message);
	} else {
		console.log("Connected to the SQLite database.");
	}
});

// Root route
app.get("/", (req, res) => {
	console.log("Root route accessed");
	res.send("Development server is running!");
});

// Create a user
app.post("/register", async (req, res) => {
	const { username, email, password } = req.body;
	console.log("Register endpoint hit with data:", { username, email });

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
						console.error(
							"Registration error: Username or email already exists"
						);
						res.status(400).json({ error: "Username or email already exists" });
					} else {
						console.error("Database error during registration:", err.message);
						res.status(500).json({ error: "Database error" });
					}
					return;
				}
				console.log("User registered successfully:", { username, email });
				res.status(201).json({ message: "User registered successfully" });
			}
		);
	} catch (error) {
		console.error("Server error during registration:", error.message);
		res.status(500).json({ error: "Server error" });
	}
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
	const token = req.headers["authorization"];
	if (!token) {
		console.warn("Token not provided in request");
		return res.status(403).json({ error: "No token provided" });
	}

	console.log("Token received:", token);

	jwt.verify(token, SECRET_KEY, (err, decoded) => {
		if (err) {
			console.error("Token verification failed:", err.message);
			return res.status(401).json({ error: "Unauthorized" });
		}
		console.log("Token verified successfully. Decoded payload:", decoded);
		req.userId = decoded.userId; // Attach userId to the request object
		next();
	});
};

// Login endpoint
app.post("/login", (req, res) => {
	const { identifier, password } = req.body;
	console.log("Login endpoint hit with identifier:", identifier);

	db.get(
		"SELECT * FROM users WHERE email = ? OR username = ?",
		[identifier, identifier],
		(err, row) => {
			if (err) {
				console.error("Database error during login:", err.message);
				res.status(500).json({ error: "Internal server error" });
				return;
			}
			if (!row) {
				console.warn("Invalid credentials for identifier:", identifier);
				res.status(401).json({ error: "Invalid credentials" });
				return;
			}

			// Check if the password matches the stored hash
			bcrypt.compare(password, row.password_hash, (err, result) => {
				if (err) {
					console.error("Error comparing passwords:", err.message);
					res.status(500).json({ error: "Internal server error" });
					return;
				}
				if (!result) {
					console.warn("Password mismatch for identifier:", identifier);
					res.status(401).json({ error: "Invalid credentials" });
					return;
				}

				// Generate JWT token
				const token = jwt.sign({ userId: row.user_id }, SECRET_KEY, {
					expiresIn: "1h", // Token expires in 1 hour
				});
				console.log("Token generated for user:", row.user_id);

				res.cookie("token", token, {
					httpOnly: true,
					secure: true, // Use secure cookies in production
					sameSite: "strict",
				});
				res.status(200).json({ message: "Login successful", token });
			});
		}
	);
});

// POST endpoint to add a new product
app.post("/products", verifyToken, (req, res) => {
	const { name, description, price, category, image_url } = req.body;
	console.log("Add product endpoint hit by user:", req.userId, "with data:", {
		name,
		description,
		price,
		category,
		image_url,
	});

	db.run(
		"INSERT INTO products (name, description, price, category, image_url) VALUES (?, ?, ?, ?, ?)",
		[name, description, price, category, image_url],
		function (err) {
			if (err) {
				console.error("Error adding product:", err.message);
				res.status(500).json({ error: err.message });
				return;
			}
			console.log("Product added successfully with ID:", this.lastID);
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

// Logout endpoint
app.post("/logout", (req, res) => {
	console.log("Logout endpoint hit");
	res.clearCookie("token");
	res.status(200).json({ message: "Logged out successfully" });
});

// Dashboard route to fetch user data
app.get("/dashboard", verifyToken, (req, res) => {
	const userId = req.userId; // Extract user ID from the verified token
	console.log("Dashboard accessed by user:", userId);

	// Queries to fetch user details and related data
	const userQuery = `SELECT user_id, username, email FROM users WHERE user_id = ?`;
	const carbonCalculationsQuery = `SELECT * FROM carbon_calculations WHERE user_id = ?`;
	const energyCalculationsQuery = `SELECT * FROM energy_calculations WHERE user_id = ?`;

	// Execute queries and combine results
	db.get(userQuery, [userId], (err, user) => {
		if (err) {
			console.error("Error fetching user details:", err.message);
			return res.status(500).json({ error: "Database error" });
		}

		if (!user) {
			console.warn("User not found for ID:", userId);
			return res.status(404).json({ error: "User not found" });
		}

		// Fetch carbon calculations
		db.all(carbonCalculationsQuery, [userId], (err, carbonCalculations) => {
			if (err) {
				console.error("Error fetching carbon calculations:", err.message);
				return res.status(500).json({ error: "Database error" });
			}

			// Fetch energy calculations
			db.all(energyCalculationsQuery, [userId], (err, energyCalculations) => {
				if (err) {
					console.error("Error fetching energy calculations:", err.message);
					return res.status(500).json({ error: "Database error" });
				}

				// Combine all data into a single response
				const responseData = {
					user,
					carbonCalculations,
					energyCalculations,
				};

				console.log("Dashboard data fetched successfully for user:", userId);
				res.json(responseData);
			});
		});
	});
});

// Start the server
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
