/*
 * PROJECT DATA — single source of truth for every project on the site.
 *
 * Used by the homepage "Selected Work" section and by projects.html.
 * Content was moved here verbatim from the old homepage flashcards.
 *
 * To change what is featured, edit FEATURED below (order = display order).
 * The homepage shows the first three.
 *
 * Fields
 *   id / slug       stable identifier, also used to pick the preview visual
 *   number          archive number (01–20), kept from the original layout
 *   category        filter group id — see CATEGORIES
 *   sourceCategory  the group the project was listed under originally
 *   githubUrl       repository (null if none)
 *   liveDemoUrl     live demo (null if none)
 *   image           real screenshot { src, alt, caption } or null → the
 *                   card draws a diagram from project-visuals.js instead
 *   status, year    only set where the existing content states them
 */
(function (root) {
    "use strict";

    var FEATURED = ["open-analyst","avjns","ai-project-manager"];

    var CATEGORIES = [
        { id: "agentic", label: "Agentic AI & LLMs" },
        { id: "ml", label: "Machine Learning" },
        { id: "data", label: "Data Science & Analytics" },
        { id: "fullstack", label: "Full-Stack Development" },
        { id: "mobile", label: "Mobile Development" }
    ];

    var PROJECTS = [
        {
            "id": "avjns",
            "slug": "avjns",
            "number": "01",
            "title": "AVJNS",
            "subtitle": "Anonymous Victim-Centered Justice Navigation System",
            "description": "A multi-agent system that navigates Sri Lankan legal information using retrieval-augmented generation.",
            "category": "agentic",
            "sourceCategory": "Agentic AI",
            "technologies": [
                "Multi-Agent",
                "RAG",
                "LLM",
                "Legal Tech"
            ],
            "featured": true,
            "githubUrl": "https://github.com/YOOSUF-HUB/AVJNS",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Combines LLMs, RAG, and document retrieval across specialised agents.",
            "keyFeatures": [
                "Multi-Agent Architecture",
                "Retrieval-Augmented Generation",
                "Legal Document Retrieval",
                "LLM-Based Reasoning"
            ],
            "visual": "avjns"
        },
        {
            "id": "ai-project-manager",
            "slug": "ai-project-manager",
            "number": "02",
            "title": "AI Project Manager",
            "subtitle": "Model Context Protocol Server for Claude Desktop",
            "description": "An MCP server that lets Claude Desktop run project management actions through safe, predefined tools.",
            "category": "agentic",
            "sourceCategory": "Agentic AI",
            "technologies": [
                "MCP",
                "Python",
                "SQLite",
                "Claude Desktop"
            ],
            "featured": true,
            "githubUrl": "https://github.com/YOOSUF-HUB/AI-Project-Manager-MCP-Server",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Exposes controlled tools instead of raw database access, with audit logs on every write.",
            "keyFeatures": [
                "Sprint Risk Reporting",
                "Team Workload Analysis",
                "Client Status Reports",
                "Audit-Logged Write Actions"
            ],
            "visual": "ai-project-manager"
        },
        {
            "id": "pharmacy-inventory-mcp",
            "slug": "pharmacy-inventory-mcp",
            "number": "03",
            "title": "Pharmacy Inventory MCP",
            "subtitle": "AI-Driven Inventory Assistant",
            "description": "An MCP server exposing stock, reorder, and expiry tools over a SQLite pharmacy inventory.",
            "category": "agentic",
            "sourceCategory": "Agentic AI",
            "technologies": [
                "MCP",
                "Python",
                "SQLite",
                "Inventory"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/pharmacy-inventory-mcp-server",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Lets an AI client query and update stock through a discoverable, approval-gated tool surface.",
            "keyFeatures": [
                "Tool-Based Database Access",
                "Stock & Reorder Analysis",
                "Batch Expiry Checks",
                "Natural-Language Queries"
            ],
            "visual": "pharmacy-inventory-mcp"
        },
        {
            "id": "idea-forge",
            "slug": "idea-forge",
            "number": "04",
            "title": "Idea Forge",
            "subtitle": "Agentic Product Coach",
            "description": "Scores product ideas on clarity, feasibility, novelty, and demand, then drafts a tight MVP plan.",
            "category": "agentic",
            "sourceCategory": "Agentic AI",
            "technologies": [
                "Next.js",
                "TypeScript",
                "Groq",
                "Agent SDK"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/idea-forge",
            "liveDemoUrl": null,
            "image": null,
            "overview": "A tool-calling coach that saves, compares, and plans ideas while keeping every record in the browser.",
            "keyFeatures": [
                "Four-Dimension Scoring Rubric",
                "Tool-Calling Agent Loop",
                "Constrained MVP Plans",
                "Browser-Only Idea Storage"
            ],
            "visual": "idea-forge"
        },
        {
            "id": "open-analyst",
            "slug": "open-analyst",
            "number": "05",
            "title": "Open Analyst",
            "subtitle": "Open-Source Conversational Data Analyst",
            "description": "Upload a dataset, ask a question, and get statistics, charts, and plain-language insights without code.",
            "category": "agentic",
            "sourceCategory": "Agentic AI",
            "technologies": [
                "FastAPI",
                "React",
                "PostgreSQL",
                "LLM"
            ],
            "featured": true,
            "githubUrl": "https://github.com/YOOSUF-HUB/Open-Analyst",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Deterministic analysis tools do the maths while an LLM orchestrates them. Currently in active development.",
            "keyFeatures": [
                "LLM Tool Orchestration",
                "Accurate Deterministic Stats",
                "Auto-Generated Visualisations",
                "Dockerised Full Stack"
            ],
            "visual": "open-analyst",
            "status": "In active development"
        },
        {
            "id": "api-sentinel-ai",
            "slug": "api-sentinel-ai",
            "number": "06",
            "title": "API Sentinel AI",
            "subtitle": "AI-Powered API Security & Documentation Analysis",
            "description": "Detects API vulnerabilities and analyses specifications with LLM-driven semantic search.",
            "category": "ml",
            "sourceCategory": "AI & Machine Learning",
            "technologies": [
                "LLM",
                "API Security",
                "RAG",
                "FastAPI"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/API-Sentinel-AI",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Evaluates APIs, detects vulnerabilities, and returns security recommendations.",
            "keyFeatures": [
                "AI-Based API Analysis",
                "Security Vulnerability Detection",
                "Semantic API Documentation Search",
                "LLM-Powered Security Insights"
            ],
            "visual": "api-sentinel-ai"
        },
        {
            "id": "complyai",
            "slug": "complyai",
            "number": "07",
            "title": "ComplyAI",
            "subtitle": "AI Policy & Document Compliance Assistant",
            "description": "A RAG assistant that turns long policy PDFs into answers, checklists, and risk reports.",
            "category": "ml",
            "sourceCategory": "AI & Machine Learning",
            "technologies": [
                "FastAPI",
                "Gemini",
                "FAISS",
                "RAG"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/complyai-policy-assistant",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Chunks and embeds uploaded PDFs into FAISS, then answers with the source passages cited.",
            "keyFeatures": [
                "PDF Ingestion & Chunking",
                "FAISS Vector Retrieval",
                "Compliance Checklist Generation",
                "Source-Cited Answers"
            ],
            "visual": "complyai"
        },
        {
            "id": "sentiment-analysis",
            "slug": "sentiment-analysis",
            "number": "08",
            "title": "Sentiment Analysis",
            "subtitle": "LSTM Neural Network for Review Classification",
            "description": "A custom LSTM trained on 25,000 IMDB reviews, deployed live as an interactive Streamlit app.",
            "category": "ml",
            "sourceCategory": "AI & Machine Learning",
            "technologies": [
                "TensorFlow",
                "Keras",
                "NLTK",
                "Streamlit"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/LSTM-Sentiment-Analysis",
            "liveDemoUrl": "https://lstm-sentiment-analysis-oywdyks2zngkjpzwzvxnvn.streamlit.app/",
            "image": null,
            "overview": "An embedding layer feeds an LSTM over NLTK-preprocessed text, reaching ~87% test accuracy.",
            "keyFeatures": [
                "Custom LSTM Architecture",
                "25K IMDB Review Training Set",
                "NLTK Stemming & Stopwords",
                "Live Streamlit Deployment"
            ],
            "visual": "sentiment-analysis"
        },
        {
            "id": "neuroscan-ai",
            "slug": "neuroscan-ai",
            "number": "09",
            "title": "NeuroScan AI",
            "subtitle": "Brain Tumor Classification from MRI",
            "description": "A custom CNN that classifies MRI scans as glioma, meningioma, pituitary, or no tumor at 97% accuracy.",
            "category": "ml",
            "sourceCategory": "AI & Machine Learning",
            "technologies": [
                "TensorFlow",
                "Keras",
                "CNN",
                "Streamlit"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/Brain_Tumor_Classification_CNN",
            "liveDemoUrl": "https://braintumorclassificationcnn-btcnn.streamlit.app/",
            "image": null,
            "overview": "Trained on 7,000+ MRI images and served through a drag-and-drop Streamlit dashboard.",
            "keyFeatures": [
                "97% Test Accuracy",
                "4-Class MRI Classification",
                "Confidence Score Breakdown",
                "Live Streamlit App"
            ],
            "visual": "neuroscan-ai"
        },
        {
            "id": "breast-cancer-ann",
            "slug": "breast-cancer-ann",
            "number": "10",
            "title": "Breast Cancer ANN",
            "subtitle": "Malignancy Prediction with Neural Networks",
            "description": "An artificial neural network that predicts whether a tumor is malignant or benign with ~98% accuracy.",
            "category": "ml",
            "sourceCategory": "AI & Machine Learning",
            "technologies": [
                "TensorFlow",
                "Keras",
                "Scikit-Learn",
                "Pandas"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/breast-cancer-ANN",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Analyses 30 cell features from the UCI Wisconsin Diagnostic dataset, with dropout to curb overfitting.",
            "keyFeatures": [
                "~98% Test Accuracy",
                "Dropout-Regularised ANN",
                "Confusion Matrix Evaluation",
                "Simulated Patient Diagnosis"
            ],
            "visual": "breast-cancer-ann"
        },
        {
            "id": "plant-doctor-ai",
            "slug": "plant-doctor-ai",
            "number": "11",
            "title": "Plant Doctor AI",
            "subtitle": "Plant Disease Detection from Leaf Images",
            "description": "A CNN, quantised with TensorFlow Lite, that diagnoses plant diseases from a leaf photo in under a second.",
            "category": "ml",
            "sourceCategory": "AI & Machine Learning",
            "technologies": [
                "TensorFlow",
                "TFLite",
                "Flask",
                "Tailwind"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/Plant-Disease-Detection-CNN",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Trained on PlantVillage with augmentation, reaching 96.5% validation accuracy.",
            "keyFeatures": [
                "96.5% Validation Accuracy",
                "TFLite Quantised Inference",
                "Drag-and-Drop Web UI",
                "Cloud Deployable"
            ],
            "visual": "plant-doctor-ai"
        },
        {
            "id": "football-xg-model",
            "slug": "football-xg-model",
            "number": "12",
            "title": "Football xG Model",
            "subtitle": "Expected Goals & Match Outcome Prediction",
            "description": "A two-stage model scoring shot quality, then predicting win, draw, or loss from real match events.",
            "category": "data",
            "sourceCategory": "Data Analysis",
            "technologies": [
                "PyTorch",
                "LightGBM",
                "StatsBomb",
                "SHAP"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/Football-xG-Match-Outcome-Prediction",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Built on StatsBomb's complete La Liga 2015/16 season — 380 matches and 9,168 shots.",
            "keyFeatures": [
                "1.3M Real Match Events",
                "Gradient-Boosted xG Baseline",
                "PyTorch Sequence Model",
                "Match Outcome Prediction"
            ],
            "visual": "football-xg-model"
        },
        {
            "id": "real-estate-price-predictor",
            "slug": "real-estate-price-predictor",
            "number": "13",
            "title": "Real Estate Price Predictor",
            "subtitle": "House Price Prediction on the Ames Dataset",
            "description": "A Random Forest model served through Flask that estimates house prices from 12 key property features.",
            "category": "data",
            "sourceCategory": "Data Analysis",
            "technologies": [
                "Scikit-Learn",
                "Flask",
                "Pandas",
                "Random Forest"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/Real-Estate-Price-Pred-App",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Cut 80 raw columns down to the 12 strongest price drivers and still reached an R² of ~0.91.",
            "keyFeatures": [
                "R² Score of ~0.91",
                "Feature Selection (80 → 12)",
                "REST Prediction API",
                "Glassmorphism UI"
            ],
            "visual": "real-estate-price-predictor"
        },
        {
            "id": "medisync",
            "slug": "medisync",
            "number": "14",
            "title": "MediSync",
            "subtitle": "Smart Pharmacy Management System",
            "description": "Centralised inventory, prescriptions, sales, and batch tracking for pharmacy operations.",
            "category": "fullstack",
            "sourceCategory": "Full-Stack Development",
            "technologies": [
                "Django",
                "MongoDB",
                "AI",
                "REST API"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/Smart-Pharmacy-System",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Centralises pharmacy inventory, prescriptions, sales, and stock control.",
            "keyFeatures": [
                "Pharmacy Inventory Management",
                "Prescription & Sales Management",
                "Batch & Expiry Tracking",
                "AI-Assisted Pharmacy Workflows"
            ],
            "visual": "medisync"
        },
        {
            "id": "campuscore",
            "slug": "campuscore",
            "number": "15",
            "title": "CampusCore",
            "subtitle": "Smart Campus Management Platform",
            "description": "A Spring Boot and React platform for campus facilities, space bookings, and maintenance ticketing.",
            "category": "fullstack",
            "sourceCategory": "Full-Stack Development",
            "technologies": [
                "Spring Boot",
                "React",
                "PostgreSQL",
                "OAuth 2.0"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/PAF-smart-campus",
            "liveDemoUrl": "https://it3030-paf-2026-smart-campus.vercel.app",
            "image": {
                "src": "assets/images/projects/campuscore.webp",
                "alt": "CampusCore sign-in page with the platform overview beside the institutional Google sign-in",
                "caption": "Live site — sign-in"
            },
            "overview": "A four-module team monorepo; I owned Module B, booking management, from API through to UI.",
            "keyFeatures": [
                "Spring Boot 3.5 & React 19",
                "Google OAuth 2.0 to JWT",
                "PostgreSQL on Neon",
                "Dockerised CI/CD"
            ],
            "visual": "campuscore"
        },
        {
            "id": "sub-tracker",
            "slug": "sub-tracker",
            "number": "16",
            "title": "Sub Tracker",
            "subtitle": "Personal Subscription Tracker",
            "description": "Tracks paid subscriptions, upcoming renewals, and monthly and yearly spend in one dashboard.",
            "category": "fullstack",
            "sourceCategory": "Full-Stack Development",
            "technologies": [
                "Next.js",
                "TypeScript",
                "Turso",
                "Tailwind"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/Sub-Tracker-App",
            "liveDemoUrl": "https://sub-tracker-app-seven.vercel.app",
            "image": null,
            "overview": "Covers renewal alerts and analytics on spend by category, net burn, and subscription inflation.",
            "keyFeatures": [
                "Spending Analytics Dashboard",
                "Renewal Reminders (7 / 30 Days)",
                "Bulk Edit & Drag-to-Sort",
                "Signed-Session Auth"
            ],
            "visual": "sub-tracker"
        },
        {
            "id": "versori",
            "slug": "versori",
            "number": "17",
            "title": "Versori",
            "subtitle": "Textile & Garment Management System",
            "description": "An end-to-end platform for textile inventory, client orders, production status, and staff.",
            "category": "fullstack",
            "sourceCategory": "Full-Stack Development",
            "technologies": [
                "PHP",
                "MySQL",
                "JavaScript",
                "RBAC"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/Textile-Garment-Management-System",
            "liveDemoUrl": "https://versoriapp.vercel.app",
            "image": null,
            "overview": "A team project I led, with a secure PHP back end and role-based access across every module.",
            "keyFeatures": [
                "Inventory & Raw Materials",
                "Order & Production Tracking",
                "Role-Based Access Control",
                "Operations Dashboard"
            ],
            "visual": "versori"
        },
        {
            "id": "techhub",
            "slug": "techhub",
            "number": "18",
            "title": "TechHub",
            "subtitle": "Online Stock Management System",
            "description": "A Java web app that manages stock, suppliers, customers, orders, and reports in one place.",
            "category": "fullstack",
            "sourceCategory": "Full-Stack Development",
            "technologies": [
                "Java",
                "Servlets",
                "JSP",
                "MySQL"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/Online-Stock-Management-System",
            "liveDemoUrl": null,
            "image": null,
            "overview": "Uses an MVC servlet architecture with separate dashboards for stock managers, sales reps, and auditors.",
            "keyFeatures": [
                "Stock & Supplier Management",
                "Customer Order Workflows",
                "Role-Based Dashboards",
                "Report Generation"
            ],
            "visual": "techhub"
        },
        {
            "id": "biome",
            "slug": "biome",
            "number": "19",
            "title": "Biome",
            "subtitle": "NASA Space Apps Challenge 2026 — Sri Lanka",
            "description": "Turns free NASA Earth data into drought, flood, and landslide warnings for every Sri Lankan district.",
            "category": "fullstack",
            "sourceCategory": "Full-Stack Development",
            "technologies": [
                "NASA Earth Data",
                "Python",
                "Geospatial",
                "Vercel"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/biome",
            "liveDemoUrl": "https://biome-rosy.vercel.app",
            "image": {
                "src": "assets/images/projects/biome.webp",
                "alt": "Biome landing page: “Drought, flood, landslide. Seen from space, before they come.” over NASA satellite imagery",
                "caption": "Live site — landing page"
            },
            "overview": "A hackathon team build with daily risk levels and a 12-month outlook, in English, Sinhala, and Tamil.",
            "keyFeatures": [
                "District & Division Risk Levels",
                "12-Month Climate Outlook",
                "Safer-Places Mapping",
                "Telegram Alerts"
            ],
            "visual": "biome",
            "year": 2026
        },
        {
            "id": "aura",
            "slug": "aura",
            "number": "20",
            "title": "Aura",
            "subtitle": "Health & Wellbeing Android App",
            "description": "A native Android app for tracking mood, habits, and hydration to build healthier daily routines.",
            "category": "mobile",
            "sourceCategory": "Mobile Development",
            "technologies": [
                "Kotlin",
                "Android",
                "XML Layouts",
                "Gradle"
            ],
            "featured": false,
            "githubUrl": "https://github.com/YOOSUF-HUB/Aura",
            "liveDemoUrl": null,
            "image": null,
            "overview": "A multi-screen Kotlin app with sign-up, a home hub, and dedicated wellbeing trackers.",
            "keyFeatures": [
                "Mood Selector",
                "Habit Tracker",
                "Hydration Reminders",
                "User Sign-Up & Login"
            ],
            "visual": "aura"
        }
    ];

    PROJECTS.forEach(function (p) { p.featured = FEATURED.indexOf(p.id) !== -1; });

    root.PORTFOLIO_PROJECTS = {
        featured: FEATURED,
        categories: CATEGORIES,
        projects: PROJECTS,
        byId: function (id) {
            for (var i = 0; i < PROJECTS.length; i++) if (PROJECTS[i].id === id) return PROJECTS[i];
            return null;
        },
        featuredProjects: function () {
            return FEATURED.map(this.byId).filter(Boolean);
        },
        categoryLabel: function (id) {
            for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i].label;
            return id;
        }
    };
})(window);
