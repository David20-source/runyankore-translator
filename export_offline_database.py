#!/usr/bin/env python3
"""
Export main database to offline JSON format for Runyankore Translator
SIMPLIFIED: No sentences, only words and phrases
"""
import sqlite3
import os
import json
from datetime import datetime

def calculate_version_from_count(total_count):
    """Calculate version based on translation count"""
    if total_count <= 0:
        return "1.0"

    increments = total_count / 100
    major = int(increments // 10) + 1
    minor = int(increments % 10)

    return f"{major}.{minor}"

def export_to_offline():
    """Export active translations to offline JSON format"""

    print("=" * 60)
    print("🔄 Exporting to offline JSON database...")

    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    main_db = os.path.join(base_dir, "backend", "data", "translations.db")
    offline_json = os.path.join(base_dir, "static", "data", "offline_dictionary.json")

    if not os.path.exists(main_db):
        print(f"❌ ERROR: Main database not found at: {main_db}")
        return False

    try:
        # Connect to main database
        main_conn = sqlite3.connect(main_db)
        main_cursor = main_conn.cursor()

        # Get ALL translations
        main_cursor.execute('''
            SELECT runyankore, english, category
            FROM translations
            WHERE is_deleted = 0
            ORDER BY runyankore
        ''')

        all_translations = main_cursor.fetchall()
        total_count = len(all_translations)

        print(f"✅ Database has: {total_count} total translations")

        # Count words vs phrases BASED ON TEXT (not category)
        word_count = 0
        phrase_count = 0
        all_entries = []
        categories_count = {}

        for runyankore, english, category in all_translations:
            # Determine if it's a word or phrase by text length
            text = runyankore or english or ""
            word_count_in_text = len(text.split())

            if word_count_in_text == 1:
                item_type = "word"
                word_count += 1
            else:
                item_type = "phrase"
                phrase_count += 1

            # Track category
            cat = category.strip() if category and category.strip() else 'general'
            categories_count[cat] = categories_count.get(cat, 0) + 1

            all_entries.append({
                'r': runyankore,
                'e': english,
                'c': cat,
                't': item_type  # 'word' or 'phrase'
            })

        # Calculate version
        version = calculate_version_from_count(total_count)
        print(f"📈 Version: v{version}")
        print(f"📊 Counts: {word_count} words, {phrase_count} phrases")

        # Create directories if needed
        os.makedirs(os.path.dirname(offline_json), exist_ok=True)

        # Create database_version.json
        version_file = os.path.join(base_dir, "static", "data", "database_version.json")

        today = datetime.now()

        # SIMPLE VERSION DATA
        version_data = {
            'version': version,
            'display_version': f"v{version}",
            'timestamp': today.isoformat(),
            'total_translations': total_count,
            'words': word_count,
            'phrases': phrase_count,
            'categories': len(categories_count),
            'build_date': today.strftime('%Y-%m-%d')
        }

        with open(version_file, 'w', encoding='utf-8') as f:
            json.dump(version_data, f, ensure_ascii=False, indent=2)

        # Create the main JSON file
        export_data = {
            'version': version,
            'display_version': f"v{version}",
            'count': total_count,
            'total_translations': total_count,
            'words': word_count,
            'phrases': phrase_count,
            'categories': len(categories_count),
            'created_at': today.isoformat(),
            'build_date': today.strftime('%Y-%m-%d'),
            'translations': all_entries
        }

        # Save to JSON file
        with open(offline_json, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)

        print(f"\n✅ SUCCESS: Exported {total_count} entries")
        print(f"📁 File size: {os.path.getsize(offline_json) / 1024:.1f} KB")
        print(f"🏷️  Version: v{version}")

        # Show category breakdown
        if categories_count:
            print(f"\n📊 Categories ({len(categories_count)} total):")
            for cat, count in sorted(categories_count.items()):
                percentage = (count / total_count) * 100
                print(f"   • {cat}: {count} ({percentage:.1f}%)")

        # Close connection
        main_conn.close()

        print("=" * 60)
        return True

    except Exception as e:
        print(f"\n❌ Export failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("🏁 Runyankore Translator - Offline Database Export")
    print("=" * 60)

    if export_to_offline():
        print("✅ Export successful!")
    else:
        print("❌ Export failed!")
    print("=" * 60)