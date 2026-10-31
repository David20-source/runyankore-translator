# Runyankore ↔ English Smart Translator PWA

[![Live App](https://img.shields.io/badge/Live_App-Visit_Website-success?style=for-the-badge&logo=google-chrome&logoColor=white)](https://runyankoretranslator.pythonanywhere.com)
[![Python](https://img.shields.io/badge/Python-3.x-blue?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-Framework-black?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org)
[![PWA](https://img.shields.io/badge/PWA-Offline_Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

> **Preserving Runyankore culture through modern technology.**

A Progressive Web App (PWA) built to promote the Runyankore language. It is designed to work reliably even in low-connectivity environments.

## 📱 Live Demo
[Click here to use the Translator](https://runyankoretranslator.pythonanywhere.com)

## ✨ Current Features (Working Now)

### 🔄 Translation Engine
- **Bi-directional Translation:** Seamless translation between Runyankore and English.
- **Offline-First Architecture:** Uses a local SQLite database. Works without internet after first load.
- **Smart Matching:** Uses Fuzz matching for spelling variations.
- **Quick Phrases:** One-click buttons for common greetings.

### 📖 Dictionary & Search
- **Intelligent Search:** Autocomplete suggestions in both languages.
- **Partial Word Matching:** Typing "Ora" suggests "Oraire ota".

### 🔊 Audio & Accessibility
- **Text-to-Speech (English):** Natural English voice.
- **Text-to-Speech (Runyankore):** Uses Swahili voice technology for Bantu pronunciation.
- **Voice Input (English):** Speak into your microphone to translate automatically.

### 📱 PWA & User Experience
- **Installable App:** Works on Android, iOS, Windows, and Desktop.
- **Translation History:** Saves your recent translations locally.
- **Export to PDF:** Export your history to a printable PDF.

### 👥 Community & Admin
- **Community Contribution:** Users can submit new translations.
- **Secure Admin Panel:** Review submissions, manage synonyms, and view user searches.
- **Session Security:** 10-minute auto-logout for admin routes.

## 🛠️ Tech Stack
- **Backend:** Python, Flask
- **Database:** SQLite
- **Frontend:** HTML, CSS, JavaScript (PWA)
- **Security:** Session-based authentication

## 📊 Dataset
A curated dataset of **2,025** Runyankore-English pairs has been prepared for future AI training.

## 🚀 Roadmap (In Progress)
- Fine-tune a multilingual sentence embedding model using the 2,025 pairs.
- Integrate the model into the PWA for semantic search.

## 👨🏾‍💻 Developer
**David Nyanzwengye**
- Bachelor of Information Technology, Muteesa I Royal University, Uganda
- [GitHub Profile](https://github.com/David20-source)