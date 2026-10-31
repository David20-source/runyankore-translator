#!/usr/bin/env python3
"""
Create simple JSON offline dictionary - RELIABLE VERSION
"""
import sqlite3
import json
import os
from datetime import datetime

def create_json_database():
    """Create a simple JSON offline dictionary that ALWAYS works"""
    
    # Paths
    flask_db_path = "backend/data/translations.db"
    json_path = "static/data/offline_dictionary.json"
    
    print("📝 Creating RELIABLE JSON offline dictionary...")
    
    # Create directories
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    
    # Connect to source database
    conn = sqlite3.connect(flask_db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get all non-deleted translations
    cursor.execute('''
        SELECT runyankore, english, category 
        FROM translations 
        WHERE is_deleted = FALSE
        ORDER BY 
            CASE category
                WHEN 'greetings' THEN 1
                WHEN 'common_phrases' THEN 2
                ELSE 3
            END,
            LENGTH(runyankore)
    ''')
    
    # Create the dictionary
    translations = []
    for row in cursor.fetchall():
        translations.append({
            'r': row['runyankore'],      # Short keys for smaller file
            'e': row['english'],
            'c': row['category'] or 'general'
        })
    
    # Add common phrases that should ALWAYS work offline
    essential_phrases = [
        {"r": "Amagara gawe?", "e": "How is your life?", "c": "greetings"},
        {"r": "Yebare", "e": "Thank you", "c": "greetings"},
        {"r": "Oraire ota", "e": "Good morning", "c": "greetings"},
        {"r": "Ndi gye", "e": "I am fine", "c": "greetings"},
        {"r": "Agandi", "e": "How are you?", "c": "greetings"},
        {"r": "Webale", "e": "Thank you (alternative)", "c": "greetings"},
        {"r": "Nyowe", "e": "I/Me", "c": "pronouns"},
        {"r": "Iwe", "e": "You", "c": "pronouns"},
        {"r": "Oburo", "e": "Millet", "c": "food"},
        {"r": "Amate", "e": "Milk", "c": "food"},
        {"r": "Ente", "e": "Cow", "c": "animals"},
        {"r": "Embuzi", "e": "Goat", "c": "animals"},
        {"r": "Enyama", "e": "Meat", "c": "food"},
        {"r": "Ebitookye", "e": "Bananas", "c": "food"},
        {"r": "Taata", "e": "Father", "c": "family"},
        {"r": "Maama", "e": "Mother", "c": "family"},
        {"r": "Omwana", "e": "Child", "c": "family"},
    ]
    
    # Combine with database translations
    all_translations = essential_phrases + translations
    
    # Remove duplicates
    unique_translations = []
    seen = set()
    for item in all_translations:
        key = (item['r'].lower(), item['e'].lower())
        if key not in seen:
            seen.add(key)
            unique_translations.append(item)
    
    # Save to JSON
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({
            'version': datetime.now().strftime('%Y%m%d_%H%M%S'),
            'count': len(unique_translations),
            'created_at': datetime.now().isoformat(),
            'translations': unique_translations
        }, f, ensure_ascii=False, indent=2)
    
    # Also create a simple text version for debugging
    with open('static/data/offline_dictionary.txt', 'w', encoding='utf-8') as f:
        f.write(f"Runyankore Translator Offline Dictionary\n")
        f.write(f"Generated: {datetime.now()}\n")
        f.write(f"Total translations: {len(unique_translations)}\n")
        f.write("=" * 50 + "\n")
        for item in unique_translations[:50]:  # First 50 for reference
            f.write(f"{item['r']} → {item['e']} [{item['c']}]\n")
    
    print(f"✅ Created JSON with {len(unique_translations)} translations")
    print(f"📦 File size: {os.path.getsize(json_path) / 1024:.1f} KB")
    print(f"📍 Saved to: {json_path}")
    
    conn.close()
    return len(unique_translations)

if __name__ == "__main__":
    count = create_json_database()
    print(f"\n🎉 RELIABLE offline dictionary created!")
    print(f"   Total translations: {count}")
    print(f"   File format: JSON (simple, always works)")
    print(f"\nNext: Upload the JSON file and new JavaScript to PythonAnywhere")