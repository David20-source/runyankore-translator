# Runyankore ↔ English Smart Translator
**User Guide**  
**Version:** 3.0  
**Live App:** [https://runyankoretranslator.pythonanywhere.com](https://runyankoretranslator.pythonanywhere.com)  
**Developer:** Nyanzwengye David  
**Platform:** Web (installable as PWA on Android, iOS, Windows, and Desktop)  
**Last Updated:** Oct, 2026  

---

## 1. Introduction
The Runyankore ↔ English Smart Translator is a web-based tool built to preserve and promote the Runyankore language through modern technology.

It allows you to:
- Translate between Runyankore and English in both directions
- Look up words and phrases with autocomplete
- Use the app completely offline after the first load
- Save and revisit translation history
- Listen to pronunciations with built-in text-to-speech
- Install the app like a native application on phone or computer

Free to use, works on any modern browser (Chrome, Edge, Safari, Firefox).

---

## 2. Getting Started

### 2.1 Opening the App
1. Open your browser.
2. Go to: [https://runyankoretranslator.pythonanywhere.com](https://runyankoretranslator.pythonanywhere.com)
3. On first use you'll see a consent banner at the bottom. Click **Accept** — this is remembered on your device.

### 2.2 First-Load Requirement
- The first time you open the app, you need internet.
- After the first successful load, the offline dictionary is saved to your device — the app then works without internet.

### 2.3 Understanding the Layout
| Area | Purpose |
| :--- | :--- |
| **Header** | Word/phrase counts, version badge, admin link, offline indicator |
| **Translation Cards** | Runyankore input · Translation Result · English input |
| **Dictionary Section** | Search box with autocomplete and results |
| **Footer** | Quick links, developer contact, legal pages, Support button |

---

## 3. Translating Text

### 3.1 Runyankore → English
1. Type or paste Runyankore text into the **Runyankore Input** box (left).
2. Click **"Translate to English"**.
3. The result appears in the **Translation Result** card (middle) with a confidence score.
4. Translation Details below show: original, translation, confidence, direction, source, and time.

### 3.2 English → Runyankore
1. Type English text into the **English Input** box (right).
2. Click **"Translate to Runyankore"**.
3. Result appears in the middle card.

### 3.3 Source Icons
- 📱 **Offline** — translation came from the dictionary stored on your device (fast, no internet needed)
- 🌐 **Smart Match** — translation came from the online server (needs internet)

### 3.4 If a Translation Is Not Found
You'll see: *"Translation not found. Try a different word or check spelling."*
**Try:**
- Checking the spelling (Runyankore spellings can vary)
- Using a shorter form of the word
- Using the dictionary search to find similar words
- Connecting to the internet (Smart Match tries harder)

### 3.5 Action Buttons on the Result Card
| Button | Purpose |
| :--- | :--- |
| **Copy 📋** | Copy the translation to your clipboard |
| **Save 💾** | Save the translation to your history |
| **Speak 🔉** | Read it aloud (English or Runyankore voice) |
| **Clear ✖** | Clear the result area |

---

## 4. Searching the Dictionary
1. Scroll to the **Runyankore Dictionary** section.
2. Type at least 2 characters — autocomplete suggestions appear instantly.
3. Click a suggestion or press Enter / click Search.
4. Results show: Runyankore word · English word · Category · Source (📱/🌐)

**Tips:**
- Search works in both languages at once.
- Partial words work: typing "Ora" suggests "Oraire ota".
- Offline search runs first; if nothing is found and you're online, the server is queried automatically.
- Click Clear next to the search box to reset.

---

## 5. Quick Phrases
Above each Translate button are four Quick Phrase buttons.
- **Runyankore side:** Amagara gawe? · Yebare · Oraire ota · Ndi gye
- **English side:** How is your life? · Thank you · Good morning · I am fine

Click any to insert that phrase into the input box instantly.

---

## 6. Translation History

### 6.1 Viewing
- Footer → Quick Links → **"Translation History"**
- Shows original, translation, direction, confidence, and time.

### 6.2 Saving
- Translations are saved automatically after each success.
- Use the Save button on the result card to re-save.
- History is kept locally on your device (up to 100 most recent).

### 6.3 Exporting to PDF
Open History → **"Export to PDF"** → a print-friendly tab opens → use browser Print → Save as PDF.

### 6.4 Clearing
History modal → **"Clear History"** → confirm. Deletes local history; clears server copy too if online.

---

## 7. Text-to-Speech

### 7.1 English
Click the 🔉 icon next to the English input, or Speak on the result card when the translation is in English. Uses the best natural English voice available on your device.

### 7.2 Runyankore
Click the 🔉 icon next to Runyankore input, or Speak on a Runyankore result.
*Note: Runyankore uses Swahili voice technology — the closest available match for accurate Bantu pronunciation. A one-time info note explains this on first use.*

### 7.3 Voice Input (English only)
Click the 🎤 icon next to the English input (if your device supports it), speak, and the text will be inserted and auto-translated. Works best in Chrome or Edge.

---

## 8. Offline Mode
Works fully offline after the first load.

### 8.1 What Works Offline
- Dictionary search
- Runyankore ↔ English translation (from local dictionary)
- Translation history
- Quick phrases
- Text-to-speech

### 8.2 What Needs Internet
- Smart Match translation
- Submitting new translations
- Statistics modal
- Sending feedback

### 8.3 Offline Indicator
When you go offline, an "Offline Mode" indicator appears at the top. Reconnecting briefly shows "Back Online".

### 8.4 Getting the Latest Dictionary
1. Connect to the internet.
2. Click the Refresh button in the header.
3. The page reloads with the newest dictionary — now cached for offline use.

---

## 9. Statistics & Version
Click the version badge (e.g. v3.0) at the top to open Statistics. It shows:
- Dictionary version
- Total offline translations
- Words / phrases / categories counts
- Last build date
- Your online/offline status

The word and phrase counts in the header update automatically.

---

## 10. Contributing New Translations

### 10.1 Submitting
1. Footer → Quick Links → **"Add Translation"**
2. Enter: Runyankore word/phrase, English translation, Type (Single Word or Phrase)
3. Read the important accuracy notice.
4. Tick the confirmation checkbox.
5. Click **Submit Translation**.

### 10.2 What Happens Next
- Your submission goes to the admin for review.
- It won't appear immediately — it waits for approval by language experts.
- Once approved, it becomes part of the public dictionary.

### 10.3 Requirements
- You must be online.
- You must be proficient in both Runyankore and English.
- Only submit translations you're confident are correct — incorrect ones are rejected.

---

## 11. Feedback & Support

### 11.1 Sending Feedback
Footer → Quick Links → **"Send Feedback"**. Fill in:
- Name (optional)
- Email (optional — useful if you want a reply)
- Type: General · Bug · Suggestion · Praise · Question
- Message (required)

Click **Send Feedback**.

### 11.2 Viewing Your Feedback History
Footer → Quick Links → **"My Feedback History"** — shows status (Pending / Read / Replied), admin replies, and lets you delete your own entries.

### 11.3 Supporting the Project
Click the red **"Support This Project"** button in the footer for WhatsApp / Email contact. Mention "Runyankore Translator Support" in your message.

---

## 12. Installing as an App (PWA)

### 12.1 Android / Chrome / Edge
Click the floating **"Install App"** button, or use the browser menu → **"Install App" / "Add to Home Screen"**.

### 12.2 iPhone / iPad (Safari)
1. Tap **Share**
2. Scroll → **"Add to Home Screen"**
3. Tap **Add**

### 12.3 Windows / Desktop
Click the install icon in the address bar, or use the browser menu → **"Install Runyankore Translator"**.

### 12.4 Benefits
- App icon on home screen / desktop
- Works offline like a native app
- Faster loading on repeat opens
- Full-screen mode (no browser bars)
- Better sleep management (prevents screen locking during use)

---

## 13. Troubleshooting

**App shows old version after update**
1. Clear browser history, cache, cookies, site data for this domain.
2. Close all app tabs.
3. Reopen: [https://runyankoretranslator.pythonanywhere.com](https://runyankoretranslator.pythonanywhere.com)
4. Wait 10–20 seconds for the new version to load.

**Offline dictionary not loading**
1. Make sure you're online.
2. Click Refresh in the header.
3. Wait for reload, then retry.

**"Translation not found"**
- Check spelling, try a shorter form, or try dictionary search.
- Connect to internet — Smart Match will try harder.

**Text-to-speech not working**
- Check device volume.
- Some browsers require a user click before playing audio — click the speaker again.

**Voice input not working**
- Allow microphone permission.
- Works best in Chrome/Edge.
- Make sure no other app is using the mic.

**Submitting translation fails**
- You must be online.
- Check the confirmation checkbox is ticked.

**PWA install button missing**
- Use the browser menu → **"Install App" / "Add to Home Screen"**.
- On iOS, use Safari (Chrome on iOS doesn't support install).

---

## 14. Privacy & Terms
By using the translator, you agree to the app's:
- [Terms of Service](https://runyankoretranslator.pythonanywhere.com/terms)
- [Privacy Policy](https://runyankoretranslator.pythonanywhere.com/privacy)
- [Software License](https://runyankoretranslator.pythonanywhere.com/license)

**What We Collect**
- Anonymous usage data (searches — word, direction) to improve the dictionary
- Feedback you submit (name/email are optional)
- No advertising, no third-party tracking

**Your Rights**
- Delete your own feedback anytime from "My Feedback History"
- Translation history is stored locally on your device — clear it anytime

---

## 15. Contact & Credits
**Developer:** David Nyanzwengye
- **Live app:** [https://runyankoretranslator.pythonanywhere.com](https://runyankoretranslator.pythonanywhere.com)
- **Email:** dnyanzwengye@gmail.com
- **GitHub:** [https://github.com/david20-source](https://github.com/david20-source)
- **WhatsApp:** +256 781 182 967

*Mission: Preserving Runyankore culture through modern technology.*

Special thanks to the Runyankore-speaking community whose words, phrases, and corrections continue to improve this dictionary.