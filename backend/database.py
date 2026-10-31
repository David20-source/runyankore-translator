"""
SQLite database for Runyankore Translator
"""
import sqlite3
import os
import json
import hashlib
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from difflib import SequenceMatcher  # For similarity comparison
import re
import time

class TranslationDB:
    def __init__(self, db_path: str = None):
        """Initialize database for PythonAnywhere"""
        if db_path is None:
            # This works for PythonAnywhere
            import os
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            db_path = os.path.join(base_dir, "backend", "data", "translations.db")
        
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        self.init_database()
        print(f"📦 Database initialized: {db_path}")
    
    def get_connection(self):
        """Get database connection"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def init_database(self):
        """Create tables if they don't exist"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Translations table - WITHOUT the UNIQUE constraint
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS translations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    runyankore TEXT NOT NULL,
                    english TEXT NOT NULL,
                    category TEXT DEFAULT 'general',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_deleted BOOLEAN DEFAULT FALSE,
                    deleted_at TIMESTAMP,
                    needs_review BOOLEAN DEFAULT TRUE,
                    added_by TEXT DEFAULT 'web_user'
                )
            ''')
            
            # Add indexes for performance (but not uniqueness)
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_runyankore ON translations(runyankore)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_english ON translations(english)')
            
            # Add deleted_at column if it doesn't exist
            try:
                cursor.execute('ALTER TABLE translations ADD COLUMN deleted_at TIMESTAMP')
                print("✅ Added deleted_at column to existing table")
            except sqlite3.OperationalError:
                pass
            
            # Add new columns for review system if they don't exist
            new_columns = [
                ('needs_review', 'BOOLEAN DEFAULT TRUE'),
                ('added_by', 'TEXT DEFAULT "web_user"'),
            ]
            
            for column_name, column_type in new_columns:
                try:
                    cursor.execute(f'ALTER TABLE translations ADD COLUMN {column_name} {column_type}')
                    print(f"✅ Added {column_name} column to existing table")
                except sqlite3.OperationalError:
                    pass
            
            # Translation history table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS translation_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    original_text TEXT NOT NULL,
                    translated_text TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    confidence REAL DEFAULT 0.0,
                    source TEXT DEFAULT 'web',
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Try to add source column if it doesn't exist
            try:
                cursor.execute('ALTER TABLE translation_history ADD COLUMN source TEXT DEFAULT "web"')
                print("✅ Added source column to translation_history table")
            except sqlite3.OperationalError:
                pass
            
            # ===== NEW: Synonyms table for dynamic synonym management =====
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS synonyms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    word TEXT NOT NULL,
                    synonym_of TEXT NOT NULL,
                    language TEXT DEFAULT 'english',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by TEXT DEFAULT 'admin',
                    UNIQUE(word, synonym_of)
                )
            ''')
            
            # Indexes for synonyms table
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_synonyms_word ON synonyms(word)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_synonyms_synonym_of ON synonyms(synonym_of)')

             # ========== FEEDBACK SYSTEM TABLES ==========
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    email TEXT,
                    feedback_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    user_token TEXT NOT NULL,
                    is_read BOOLEAN DEFAULT FALSE,
                    is_replied BOOLEAN DEFAULT FALSE,
                    admin_reply TEXT,
                    replied_at TIMESTAMP,
                    replied_by TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Add indexes for performance
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_feedback_token ON user_feedback(user_token)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_feedback_created ON user_feedback(created_at)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_feedback_read ON user_feedback(is_read)')
            
            # Create indexes for performance
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_runyankore ON translations(runyankore)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_english ON translations(english)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_deleted ON translations(is_deleted)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_category ON translations(category)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_history_timestamp ON translation_history(timestamp)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_history_direction ON translation_history(direction)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_deleted_at ON translations(deleted_at)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_needs_review ON translations(needs_review)')
            
            # Insert some initial translations if database is empty
            cursor.execute('SELECT COUNT(*) FROM translations')
            if cursor.fetchone()[0] == 0:
                self._insert_initial_data(cursor)
            
            # Mark all existing translations as approved
            cursor.execute('''
                UPDATE translations 
                SET needs_review = FALSE, added_by = 'system'
                WHERE needs_review = TRUE OR needs_review IS NULL
            ''')
            
            conn.commit()

            # ===== NEW: User search requests table =====
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_searches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    search_text TEXT NOT NULL,
                    search_direction TEXT NOT NULL,
                    translated_text TEXT,
                    confidence REAL,
                    source TEXT,
                    user_ip TEXT,
                    user_agent TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_translated BOOLEAN DEFAULT FALSE,
                    needs_review BOOLEAN DEFAULT TRUE,
                    reviewed_by TEXT,
                    reviewed_at TIMESTAMP,
                    notes TEXT
                )
            ''')
            
            # Add indexes
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_searches_text ON user_searches(search_text)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_searches_timestamp ON user_searches(timestamp)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_searches_needs_review ON user_searches(needs_review)')       
    
    def _insert_initial_data(self, cursor):
        """Insert initial translation data"""
        initial_translations = [
            # Greetings
            ("Amagara gawe?", "How is your life?", "greetings"),
            ("Yebare", "Thank you", "greetings"),
            ("Oraire ota", "Good morning", "greetings"),
            ("Ndi gye", "I am fine", "greetings"),
            ("Agandi", "How are you?", "greetings"),
            ("Obayo", "Are you there", "general"),
            ("Ngaha", "No", "general"),
            ("Kyahwaho", "It's over", "general"),
            ("Nyowe", "I/Me", "pronouns"),
            ("Iwe", "You", "pronouns"),
            ("Itwe", "We", "pronouns"),
            ("Imwe", "You (plural)", "pronouns"),
            ("Bo", "They", "pronouns"),
            
            # Food
            ("Ekyokurya", "Food", "food"),
            ("Amate", "Milk", "food"),
            ("Oburo", "Millet", "food"),
            ("Enyama", "Meat", "food"),
            ("Ebitookye", "Bananas", "food"),
            ("Amahuri", "Eggs", "food"),
            
            # Family
            ("Taata", "Father", "family"),
            ("Maama", "Mother", "family"),
            ("Omwana", "Child", "family"),
            ("Munyanyazi", "Sister", "family"),
            ("Murumuna", "Younger brother", "family"),
            ("Nyina", "Mother (formal)", "family"),
            
            # Common verbs
            ("Okurya", "To eat", "verbs"),
            ("Okunywa", "To drink", "verbs"),
            ("Okugyenda", "To go", "verbs"),
            ("Okwija", "To come", "verbs"),
            ("Okureeba", "To see", "verbs"),
            ("Okugamba", "To say", "verbs"),
            
            # Numbers
            ("Emwe", "One", "numbers"),
            ("Ibiri", "Two", "numbers"),
            ("Ishatu", "Three", "numbers"),
            ("Ina", "Four", "numbers"),
            ("Itaano", "Five", "numbers"),
            ("Mukaaga", "Six", "numbers"),
            
            # Time
            ("Eizooba", "Day", "time"),
            ("Ekiro", "Night", "time"),
            ("Omwaka", "Year", "time"),
            ("Okwezi", "Month", "time"),
            ("Eshaha", "Hour", "time"),
            ("Edakiika", "Minute", "time"),
            
            # Places
            ("Enju", "House", "places"),
            ("Eishomero", "School", "places"),
            ("Akatare", "Market", "places"),
            ("Ekibiina", "Class", "places"),
            ("Omusisri", "Garden", "places"),
            ("Enyanja", "Lake", "places"),
            
            # Animals
            ("Ente", "Cow", "animals"),
            ("Embuzi", "Goat", "animals"),
            ("Entaama", "Sheep", "animals"),
            ("Enkoko", "Chicken", "animals"),
            ("Embwa", "Dog", "animals"),
            ("Ekinyonyi", "Bird", "animals"),
        ]
        
        for runyankore, english, category in initial_translations:
            try:
                cursor.execute(
                    'INSERT OR IGNORE INTO translations (runyankore, english, category, needs_review, added_by) VALUES (?, ?, ?, FALSE, ?)',
                    (runyankore, english, category, 'system')
                )
            except:
                continue
        
        print("✅ Inserted initial translations")
    
    def _normalize_text(self, text: str) -> str:
        """Normalize text for comparison: lowercase and remove punctuation"""
        if not text:
            return ""
        
        text = text.lower()
        punctuation = "?.!,;:'\""
        for p in punctuation:
            text = text.replace(p, '')
        
        text = text.strip()
        return text
    
    # ========== CONTRACTION EXPANSION ==========
    def expand_contractions(self, text: str) -> str:
        """Expand English contractions for better matching"""
        contractions = {
            # Common contractions
            "don't": "do not",
            "doesn't": "does not",
            "didn't": "did not",
            "can't": "cannot",
            "couldn't": "could not",
            "wouldn't": "would not",
            "shouldn't": "should not",
            "won't": "will not",
            "wasn't": "was not",
            "weren't": "were not",
            "haven't": "have not",
            "hasn't": "has not",
            "hadn't": "had not",
            
            # Contractions with pronouns
            "i'm": "i am",
            "you're": "you are",
            "he's": "he is",
            "she's": "she is",
            "it's": "it is",
            "we're": "we are",
            "they're": "they are",
            
            # Contractions with have
            "i've": "i have",
            "you've": "you have",
            "we've": "we have",
            "they've": "they have",
            
            # Contractions with will
            "i'll": "i will",
            "you'll": "you will",
            "he'll": "he will",
            "she'll": "she will",
            "we'll": "we will",
            "they'll": "they will",
            
            # Contractions with would/had
            "i'd": "i would",
            "you'd": "you would",
            "he'd": "he would",
            "she'd": "she would",
            "we'd": "we would",
            "they'd": "they would",
            
            # Special cases
            "let's": "let us",
            "ain't": "is not",
            "ma'am": "madam",
        }
        
        if not text:
            return text
        
        text_lower = text.lower()
        for contraction, expansion in contractions.items():
            text_lower = text_lower.replace(contraction, expansion)
        
        # Preserve original capitalization if needed
        if text and text[0].isupper():
            words = text_lower.split()
            if words:
                words[0] = words[0].capitalize()
                text_lower = ' '.join(words)
        
        return text_lower
    
    # ========== PUBLIC METHODS ==========
    
    def get_translation(self, word: str, from_runyankore: bool = True) -> Optional[str]:
        """Get translation for a word/phrase - returns the most relevant one"""
        if not word or not word.strip():
            return None
        
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            original_text = word.strip()
            normalized_text = self._normalize_text(original_text)
            
            if from_runyankore:
                # Get ALL possible English translations for this Runyankore word
                cursor.execute('''
                    SELECT english, category, created_at 
                    FROM translations 
                    WHERE LOWER(TRIM(runyankore)) = LOWER(?) 
                    AND is_deleted = FALSE
                    AND needs_review = FALSE
                    ORDER BY 
                        CASE 
                            WHEN category = 'greetings' THEN 1
                            WHEN category = 'common' THEN 2
                            ELSE 3
                        END,
                        created_at DESC
                ''', (original_text,))
                
                results = cursor.fetchall()
                if results:
                    # Return the first (most relevant) translation
                    return results[0][0]
                
                # Try normalized match
                cursor.execute('''
                    SELECT english FROM translations 
                    WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(runyankore, '?', ''), '!', ''), '.', ''), ',', ''), ';', '')) = ?
                    AND is_deleted = FALSE
                    AND needs_review = FALSE
                    LIMIT 1
                ''', (normalized_text,))
                
                result = cursor.fetchone()
                if result:
                    return result[0]
                    
            else:
                # English to Runyankore - get ALL possible Runyankore spellings
                cursor.execute('''
                    SELECT runyankore, category, created_at 
                    FROM translations 
                    WHERE LOWER(TRIM(english)) = LOWER(?) 
                    AND is_deleted = FALSE
                    AND needs_review = FALSE
                    ORDER BY 
                        CASE 
                            WHEN category = 'greetings' THEN 1
                            WHEN category = 'common' THEN 2
                            ELSE 3
                        END,
                        created_at DESC
                ''', (original_text,))
                
                results = cursor.fetchall()
                if results:
                    # For now, return the first one
                    # You might want to return all or let the user choose
                    return results[0][0]
                
                # Try normalized match
                cursor.execute('''
                    SELECT runyankore FROM translations 
                    WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(english, '?', ''), '!', ''), '.', ''), ',', ''), ';', '')) = ?
                    AND is_deleted = FALSE
                    AND needs_review = FALSE
                    LIMIT 1
                ''', (normalized_text,))
                
                result = cursor.fetchone()
                if result:
                    return result[0]
            
            return None
    
    def find_similar_words(self, word: str, from_runyankore: bool = True, limit: int = 5) -> List[Dict]:
        """Find similar words using LIKE pattern matching"""
        if not word or not word.strip():
            return []
        
        with self.get_connection() as conn:
            cursor = conn.cursor()
            search_term = f"%{word.lower()}%"
            
            if from_runyankore:
                cursor.execute('''
                    SELECT runyankore, english, 
                           (CASE 
                                WHEN runyankore = ? THEN 1.0
                                WHEN runyankore LIKE ? THEN 0.8
                                ELSE 0.5
                            END) as similarity
                    FROM translations 
                    WHERE LOWER(runyankore) LIKE ? 
                    AND is_deleted = FALSE
                    AND needs_review = FALSE
                    ORDER BY similarity DESC, runyankore
                    LIMIT ?
                ''', (word.lower(), f"{word.lower()}%", search_term, limit))
            else:
                cursor.execute('''
                    SELECT runyankore, english,
                           (CASE 
                                WHEN english = ? THEN 1.0
                                WHEN english LIKE ? THEN 0.8
                                ELSE 0.5
                            END) as similarity
                    FROM translations 
                    WHERE LOWER(english) LIKE ? 
                    AND is_deleted = FALSE
                    AND needs_review = FALSE
                    ORDER BY similarity DESC, english
                    LIMIT ?
                ''', (word.lower(), f"{word.lower()}%", search_term, limit))
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    'runyankore': row['runyankore'],
                    'english': row['english'],
                    'similarity': row['similarity']
                })
            
            return results
    
    def search_translations(self, query: str, limit: int = 50) -> List[Dict]:
        """Search translations with improved ranking"""
        if not query or not query.strip():
            return []
        
        with self.get_connection() as conn:
            cursor = conn.cursor()
            search_term = f"%{query.lower()}%"
            
            cursor.execute('''
                SELECT *, 
                       (CASE 
                            WHEN runyankore = ? THEN 10
                            WHEN english = ? THEN 9
                            WHEN runyankore LIKE ? THEN 8
                            WHEN english LIKE ? THEN 7
                            WHEN runyankore LIKE ? THEN 6
                            WHEN english LIKE ? THEN 5
                            ELSE 1
                        END) as relevance
                FROM translations 
                WHERE (LOWER(runyankore) LIKE ? OR LOWER(english) LIKE ?) 
                AND is_deleted = FALSE
                AND needs_review = FALSE
                ORDER BY relevance DESC, created_at DESC
                LIMIT ?
            ''', (
                query.lower(), query.lower(),
                f"{query.lower()}%", f"{query.lower()}%",
                f"%{query.lower()}%", f"%{query.lower()}%",
                search_term, search_term, limit
            ))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def add_translation(self, runyankore: str, english: str, category: str = 'general', added_by: str = 'web_user') -> Dict:
        """
        Add new translation - allows multiple English meanings for same Runyankore word
        and multiple Runyankore spellings for same English word
        """
        try:
            if not runyankore.strip() or not english.strip():
                return {'success': False, 'message': 'Both Runyankore and English texts cannot be empty'}
        
            runyankore_clean = runyankore.strip()
            english_clean = english.strip()
        
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Check if this EXACT pair already exists (case-insensitive)
                cursor.execute('''
                    SELECT id, runyankore, english FROM translations 
                    WHERE LOWER(runyankore) = LOWER(?) 
                    AND LOWER(english) = LOWER(?)
                    AND is_deleted = FALSE
                ''', (runyankore_clean, english_clean))
                
                exact_match = cursor.fetchone()
                if exact_match:
                    return {
                        'success': False, 
                        'message': f'This exact translation pair already exists.',
                        'error_type': 'exact_duplicate',
                        'existing_id': exact_match[0]
                    }
                
                # Check if this Runyankore word already has OTHER English meanings
                cursor.execute('''
                    SELECT id, english FROM translations 
                    WHERE LOWER(runyankore) = LOWER(?) 
                    AND is_deleted = FALSE
                    LIMIT 5
                ''', (runyankore_clean,))
                
                existing_runyankore = cursor.fetchall()
                
                # Check if this English word already has OTHER Runyankore spellings
                cursor.execute('''
                    SELECT id, runyankore FROM translations 
                    WHERE LOWER(english) = LOWER(?) 
                    AND is_deleted = FALSE
                    LIMIT 5
                ''', (english_clean,))
                
                existing_english = cursor.fetchall()
                
                # Insert the new translation (allowed in all cases)
                cursor.execute('''
                    INSERT INTO translations (runyankore, english, category, needs_review, added_by)
                    VALUES (?, ?, ?, TRUE, ?)
                ''', (runyankore_clean, english_clean, category, added_by))
                
                new_id = cursor.lastrowid
                conn.commit()
                
                # Prepare helpful message
                message_parts = []
                if existing_runyankore:
                    other_meanings = [f'"{row[1]}"' for row in existing_runyankore[:3]]
                    message_parts.append(f'Runyankore "{runyankore_clean}" also means: {", ".join(other_meanings)}')
                
                if existing_english:
                    other_spellings = [f'"{row[1]}"' for row in existing_english[:3]]
                    message_parts.append(f'English "{english_clean}" also spelled as: {", ".join(other_spellings)}')
                
                message = 'Translation added successfully! '
                if message_parts:
                    message += 'Note: ' + ' | '.join(message_parts)
                
                return {
                    'success': True, 
                    'message': message,
                    'translation_id': new_id,
                    'needs_review': True,
                    'other_meanings': len(existing_runyankore),
                    'other_spellings': len(existing_english)
                }
                
        except Exception as e:
            print(f"Database error adding translation: {e}")
            return {'success': False, 'message': f'Database error: {str(e)}'}
    
    def get_all_translations(self, include_deleted: bool = False, include_pending: bool = False) -> List[Dict]:
        """Get all translations"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            where_clause = ["1=1"]
            if not include_deleted:
                where_clause.append("is_deleted = FALSE")
            if not include_pending:
                where_clause.append("needs_review = FALSE")
            
            query = f"SELECT * FROM translations WHERE {' AND '.join(where_clause)} ORDER BY created_at DESC"
            cursor.execute(query)
            return [dict(row) for row in cursor.fetchall()]
    
    def get_statistics(self) -> Dict:
        """Get database statistics"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            stats = {}
            
            cursor.execute('SELECT COUNT(*) FROM translations WHERE is_deleted = FALSE AND needs_review = FALSE')
            stats['approved_translations'] = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(*) FROM translations WHERE is_deleted = FALSE AND needs_review = TRUE')
            stats['pending_review'] = cursor.fetchone()[0]
            
            stats['total_translations'] = stats['approved_translations'] + stats['pending_review']
            
            cursor.execute('SELECT COUNT(*) FROM translations WHERE is_deleted = TRUE')
            stats['deleted_translations'] = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(DISTINCT category) FROM translations WHERE category IS NOT NULL')
            stats['categories_count'] = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(*) FROM translation_history')
            stats['history_count'] = cursor.fetchone()[0]
            
            # ===== NEW: Synonym statistics =====
            cursor.execute('SELECT COUNT(*) FROM synonyms')
            stats['synonyms_count'] = cursor.fetchone()[0]
            
            try:
                db_size = os.path.getsize(self.db_path)
                stats['database_size'] = f"{db_size / 1024:.1f} KB"
            except:
                stats['database_size'] = "Unknown"
            
            cursor.execute('''
                SELECT 
                    AVG(LENGTH(runyankore) - LENGTH(REPLACE(runyankore, ' ', '')) + 1) as avg_runyankore_words,
                    AVG(LENGTH(english) - LENGTH(REPLACE(english, ' ', '')) + 1) as avg_english_words
                FROM translations 
                WHERE is_deleted = FALSE
            ''')
            word_stats = cursor.fetchone()
            stats['word_stats'] = {
                'avg_runyankore_words': round(word_stats[0] or 1, 2),
                'avg_english_words': round(word_stats[1] or 1, 2)
            }
            
            return stats
    
    def save_to_history(self, original: str, translation: str, 
                       direction: str, confidence: float = 0.0, source: str = 'web') -> Dict:
        """Save translation to history"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO translation_history 
                    (original_text, translated_text, direction, confidence, source, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (original[:500], translation[:500], direction, confidence, source[:20], datetime.utcnow().isoformat() + 'Z'))
                
                conn.commit()
                return {'success': True, 'id': cursor.lastrowid}
        except Exception as e:
            print(f"Error saving to history: {e}")
            return {'success': False, 'message': str(e)}
    
    def get_translation_history(self, limit: int = 50) -> List[Dict]:
        """Get translation history"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT original_text as original, translated_text as translation, 
                       direction, confidence, source, timestamp
                FROM translation_history 
                ORDER BY timestamp DESC 
                LIMIT ?
            ''', (limit,))
            
            results = []
            for row in cursor.fetchall():
                timestamp = row['timestamp']
                if timestamp and not timestamp.endswith('Z'):
                    timestamp = timestamp + 'Z'
                
                results.append({
                    'original': row['original'],
                    'translation': row['translation'],
                    'direction': row['direction'],
                    'confidence': row['confidence'],
                    'source': row['source'],
                    'timestamp': timestamp
                })
            
            return results
    
    def clear_history(self) -> Dict:
        """Clear translation history"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM translation_history')
                conn.commit()
                return {'success': True, 'message': 'Translation history cleared'}
        except Exception as e:
            return {'success': False, 'message': str(e)}
    
    # ========== ADMIN METHODS ==========
    
    def update_translation(self, translation_id: int, 
                          runyankore: str, english: str, 
                          category: str = None) -> Dict:
        """Update translation"""
        try:
            if not runyankore.strip() or not english.strip():
                return {'success': False, 'message': 'Both Runyankore and English texts cannot be empty'}
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE translations 
                    SET runyankore = ?, english = ?, category = ?, 
                        updated_at = CURRENT_TIMESTAMP,
                        needs_review = TRUE
                    WHERE id = ? AND is_deleted = FALSE
                ''', (runyankore.strip(), english.strip(), category, translation_id))
                
                conn.commit()
                
                if cursor.rowcount > 0:
                    return {'success': True, 'message': 'Translation updated successfully (needs re-review)'}
                return {'success': False, 'message': 'Translation not found or already deleted'}
        except Exception as e:
            return {'success': False, 'message': str(e)}
    
    def delete_translation(self, translation_id: int, permanent: bool = False) -> Dict:
        """Delete translation (soft delete by default)"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                if permanent:
                    cursor.execute('DELETE FROM translations WHERE id = ?', (translation_id,))
                    action = 'permanently deleted'
                else:
                    cursor.execute('''
                        UPDATE translations 
                        SET is_deleted = TRUE, 
                            updated_at = CURRENT_TIMESTAMP,
                            deleted_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    ''', (translation_id,))
                    action = 'moved to trash'
                
                conn.commit()
                
                if cursor.rowcount > 0:
                    return {'success': True, 'message': f'Translation {action}'}
                return {'success': False, 'message': 'Translation not found'}
        except Exception as e:
            return {'success': False, 'message': str(e)}
    
    def restore_translation(self, translation_id: int) -> Dict:
        """Restore deleted translation"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE translations 
                    SET is_deleted = FALSE, 
                        updated_at = CURRENT_TIMESTAMP,
                        deleted_at = NULL,
                        needs_review = TRUE
                    WHERE id = ?
                ''', (translation_id,))
                
                conn.commit()
                
                if cursor.rowcount > 0:
                    return {'success': True, 'message': 'Translation restored successfully (needs review)'}
                return {'success': False, 'message': 'Translation not found'}
        except Exception as e:
            return {'success': False, 'message': str(e)}
    
    def bulk_import(self, translations: List[Dict]) -> int:
        """Import multiple translations at once"""
        imported = 0
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            for item in translations:
                try:
                    runyankore = item.get('runyankore', '').strip()
                    english = item.get('english', '').strip()
                    category = item.get('category', 'general')
                    needs_review = item.get('needs_review', True)
                    added_by = item.get('added_by', 'import')
                    
                    if not runyankore or not english:
                        continue
                    
                    cursor.execute('''
                        INSERT OR IGNORE INTO translations (runyankore, english, category, needs_review, added_by)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (runyankore, english, category, needs_review, added_by))
                    
                    if cursor.rowcount > 0:
                        imported += 1
                except Exception as e:
                    print(f"Error importing translation: {e}")
                    continue
            
            conn.commit()
        return imported
    
    def export_all(self) -> List[Dict]:
        """Export all translations for backup"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT runyankore, english, category, created_at, needs_review, added_by
                FROM translations 
                WHERE is_deleted = FALSE
                ORDER BY created_at DESC
            ''')
            return [dict(row) for row in cursor.fetchall()]
    
    def get_deleted_translations(self) -> List[Dict]:
        """Get deleted translations"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM translations WHERE is_deleted = TRUE ORDER BY deleted_at DESC')
            return [dict(row) for row in cursor.fetchall()]
    
    def empty_trash(self) -> Dict:
        """Permanently delete all items in trash"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM translations WHERE is_deleted = TRUE')
                deleted_count = cursor.rowcount
                conn.commit()
                return {
                    'success': True, 
                    'message': f'Trash emptied ({deleted_count} items permanently deleted)',
                    'deleted_count': deleted_count
                }
        except Exception as e:
            return {'success': False, 'message': str(e)}
    
    def get_translation_by_id(self, translation_id: int) -> Optional[Dict]:
        """Get translation by ID"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM translations WHERE id = ?', (translation_id,))
            result = cursor.fetchone()
            return dict(result) if result else None
    
    def get_trash_statistics(self) -> Dict:
        """Get statistics for trash bin"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM translations WHERE is_deleted = TRUE")
                total_deleted = cursor.fetchone()[0]
                
                cursor.execute('''
                    SELECT MIN(deleted_at) FROM translations 
                    WHERE is_deleted = TRUE AND deleted_at IS NOT NULL
                ''')
                oldest_date_result = cursor.fetchone()
                oldest_date = oldest_date_result[0] if oldest_date_result[0] else None
                
                cursor.execute('''
                    SELECT MAX(deleted_at) FROM translations 
                    WHERE is_deleted = TRUE AND deleted_at IS NOT NULL
                ''')
                newest_date_result = cursor.fetchone()
                newest_date = newest_date_result[0] if newest_date_result[0] else None
                
                cursor.execute('''
                    SELECT category, COUNT(*) as count 
                    FROM translations 
                    WHERE is_deleted = TRUE AND category IS NOT NULL
                    GROUP BY category 
                    ORDER BY count DESC
                ''')
                categories_result = cursor.fetchall()
                categories = [(row[0] or 'general', row[1]) for row in categories_result]
                
                return {
                    'total_deleted': total_deleted,
                    'oldest_date': oldest_date,
                    'newest_date': newest_date,
                    'categories': categories
                }
        except Exception as e:
            print(f"Error getting trash statistics: {e}")
            return {'total_deleted': 0, 'oldest_date': None, 'newest_date': None, 'categories': []}
    
    def permanent_delete(self, translation_id: int) -> Dict:
        """Permanently delete a single translation from trash"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM translations WHERE id = ? AND is_deleted = TRUE', (translation_id,))
                conn.commit()
                
                if cursor.rowcount > 0:
                    return {'success': True, 'message': 'Translation permanently deleted'}
                return {'success': False, 'error': 'Translation not found in trash'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def bulk_restore(self, translation_ids: List[int]) -> Dict:
        """Restore multiple translations"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                placeholders = ','.join(['?'] * len(translation_ids))
                query = f'''
                    UPDATE translations 
                    SET is_deleted = FALSE, 
                        updated_at = CURRENT_TIMESTAMP,
                        deleted_at = NULL,
                        needs_review = TRUE
                    WHERE id IN ({placeholders}) AND is_deleted = TRUE
                '''
                cursor.execute(query, translation_ids)
                restored_count = cursor.rowcount
                conn.commit()
                return {'success': True, 'restored_count': restored_count}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def bulk_permanent_delete(self, translation_ids: List[int]) -> Dict:
        """Permanently delete multiple translations"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                placeholders = ','.join(['?'] * len(translation_ids))
                query = f'DELETE FROM translations WHERE id IN ({placeholders}) AND is_deleted = TRUE'
                cursor.execute(query, translation_ids)
                deleted_count = cursor.rowcount
                conn.commit()
                return {'success': True, 'deleted_count': deleted_count}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    # ========== REVIEW SYSTEM METHODS ==========
    
    def get_translations_needing_review(self) -> List[Dict]:
        """Get all translations that need review"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM translations 
                WHERE needs_review = TRUE 
                AND is_deleted = FALSE
                ORDER BY created_at DESC
            ''')
            return [dict(row) for row in cursor.fetchall()]
    
    def approve_translation(self, translation_id: int, reviewed_by: str = 'admin') -> Dict:
        """Approve a translation"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE translations 
                    SET needs_review = FALSE, 
                        updated_at = CURRENT_TIMESTAMP,
                        added_by = ?
                    WHERE id = ? AND is_deleted = FALSE
                ''', (reviewed_by, translation_id))
                conn.commit()
                
                if cursor.rowcount > 0:
                    return {'success': True, 'message': 'Translation approved successfully'}
                return {'success': False, 'message': 'Translation not found or already deleted'}
        except Exception as e:
            return {'success': False, 'message': str(e)}
    
    def approve_all_pending(self, reviewed_by: str = 'admin') -> Dict:
        """Approve all pending translations at once"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute('SELECT COUNT(*) FROM translations WHERE needs_review = TRUE AND is_deleted = FALSE')
                pending_count = cursor.fetchone()[0]
                
                if pending_count == 0:
                    return {'success': True, 'approved_count': 0, 'message': 'No pending translations to approve'}
                
                cursor.execute('''
                    UPDATE translations 
                    SET needs_review = FALSE, 
                        updated_at = CURRENT_TIMESTAMP,
                        added_by = ?
                    WHERE needs_review = TRUE 
                    AND is_deleted = FALSE
                ''', (reviewed_by,))
                
                approved_count = cursor.rowcount
                conn.commit()
                
                return {
                    'success': True,
                    'approved_count': approved_count,
                    'message': f'Successfully approved {approved_count} pending translations'
                }
        except Exception as e:
            print(f"Error approving all pending translations: {e}")
            return {'success': False, 'message': str(e), 'approved_count': 0}
    
    def get_pending_count(self) -> int:
        """Get count of translations needing review"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM translations WHERE needs_review = TRUE AND is_deleted = FALSE')
            return cursor.fetchone()[0]
         # ========== DYNAMIC SYNONYM METHODS ==========
    
    def add_synonym(self, word: str, synonym_of: str, language: str = 'english', created_by: str = 'admin') -> Dict:
        """
        Add a synonym relationship between words
        Example: add_synonym('tasty', 'delicious') means 'tasty' is synonym of 'delicious'
        """
        try:
            word = word.lower().strip()
            synonym_of = synonym_of.lower().strip()
            
            if not word or not synonym_of:
                return {'success': False, 'message': 'Both words are required'}
            
            if word == synonym_of:
                return {'success': False, 'message': 'A word cannot be a synonym of itself'}
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # Check if this synonym relationship already exists
                cursor.execute('''
                    SELECT id FROM synonyms 
                    WHERE word = ? AND synonym_of = ?
                ''', (word, synonym_of))
                
                if cursor.fetchone():
                    return {'success': False, 'message': f'"{word}" is already a synonym of "{synonym_of}"'}
                
                # Insert the synonym relationship
                cursor.execute('''
                    INSERT INTO synonyms (word, synonym_of, language, created_by)
                    VALUES (?, ?, ?, ?)
                ''', (word, synonym_of, language, created_by))
                
                conn.commit()
                
                return {
                    'success': True, 
                    'message': f'✅ Added "{word}" as synonym of "{synonym_of}"',
                    'id': cursor.lastrowid
                }
                
        except Exception as e:
            print(f"Error adding synonym: {e}")
            return {'success': False, 'message': f'Database error: {str(e)}'}
    
    # ========== USER SEARCH TRACKING METHODS ==========
    
    def save_user_search(self, search_text: str, direction: str, translation_result: Dict = None, 
                        user_ip: str = None, user_agent: str = None) -> Dict:
        """
        Save every user search/translation request
        This helps admin see what users are searching for
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                is_translated = translation_result and translation_result.get('success', False)
                translated_text = translation_result.get('translation') if is_translated else None
                confidence = translation_result.get('confidence', 0) if is_translated else 0
                source = translation_result.get('source') if is_translated else None
                
                # Check if this exact search already exists (to avoid duplicates)
                cursor.execute('''
                    SELECT id FROM user_searches 
                    WHERE search_text = ? AND timestamp > datetime('now', '-1 hour')
                    ORDER BY timestamp DESC LIMIT 1
                ''', (search_text.strip(),))
                
                existing = cursor.fetchone()
                if existing:
                    # Update the existing record's timestamp
                    cursor.execute('''
                        UPDATE user_searches 
                        SET timestamp = CURRENT_TIMESTAMP,
                            translated_text = ?,
                            confidence = ?,
                            source = ?
                        WHERE id = ?
                    ''', (translated_text, confidence, source, existing[0]))
                else:
                    # Insert new search record
                    cursor.execute('''
                        INSERT INTO user_searches 
                        (search_text, search_direction, translated_text, confidence, source, 
                         user_ip, user_agent, is_translated, needs_review)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        search_text.strip(), direction, translated_text, confidence, source,
                        user_ip, user_agent, is_translated, 
                        True
                    ))
                
                conn.commit()
                return {'success': True, 'id': cursor.lastrowid if not existing else existing[0]}
                
        except Exception as e:
            print(f"Error saving user search: {e}")
            return {'success': False, 'message': str(e)}
        
    def get_user_searches(self, limit: int = 100, include_reviewed: bool = True, 
                     search_term: str = None, direction: str = None, reviewed_only: bool = False) -> List[Dict]:
        """Get user searches with filters"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            query = "SELECT * FROM user_searches WHERE 1=1"
            params = []
            
            # Handle filtering logic
            if reviewed_only:
                query += " AND needs_review = FALSE"
            elif not include_reviewed:
                query += " AND needs_review = TRUE"
            # If include_reviewed is True and reviewed_only is False, show ALL (no filter)
            
            if search_term:
                query += " AND search_text LIKE ?"
                params.append(f"%{search_term}%")
            
            if direction and direction in ['run_to_en', 'en_to_run', 'dictionary_search']:
                query += " AND search_direction = ?"
                params.append(direction)
            
            query += " ORDER BY timestamp DESC LIMIT ?"
            params.append(limit)
            
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]   

    def get_user_search_stats(self) -> Dict:
        """Get statistics about user searches"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            stats = {}
            
            # Total searches
            cursor.execute('SELECT COUNT(*) FROM user_searches')
            stats['total_searches'] = cursor.fetchone()[0]
            
            # Successful vs failed
            cursor.execute('SELECT COUNT(*) FROM user_searches WHERE is_translated = TRUE')
            stats['successful'] = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(*) FROM user_searches WHERE is_translated = FALSE')
            stats['failed'] = cursor.fetchone()[0]
            
            # Needs review (failed translations)
            cursor.execute('SELECT COUNT(*) FROM user_searches WHERE needs_review = TRUE')
            stats['needs_review'] = cursor.fetchone()[0]
            
            # Top searched terms
            cursor.execute('''
                SELECT search_text, COUNT(*) as count 
                FROM user_searches 
                GROUP BY search_text 
                ORDER BY count DESC 
                LIMIT 10
            ''')
            stats['top_searches'] = [dict(row) for row in cursor.fetchall()]
            
            # Searches by direction
            cursor.execute('''
                SELECT search_direction, COUNT(*) as count 
                FROM user_searches 
                GROUP BY search_direction
            ''')
            stats['by_direction'] = [dict(row) for row in cursor.fetchall()]
            
            # Recent failed searches
            cursor.execute('''
                SELECT search_text, COUNT(*) as count 
                FROM user_searches 
                WHERE is_translated = FALSE 
                GROUP BY search_text 
                ORDER BY count DESC 
                LIMIT 10
            ''')
            stats['top_missing'] = [dict(row) for row in cursor.fetchall()]
            
            return stats

    def mark_search_reviewed(self, search_id: int, reviewed_by: str = 'admin', notes: str = None) -> Dict:
        """Mark a search as reviewed (admin action)"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE user_searches 
                    SET needs_review = FALSE, 
                        reviewed_by = ?,
                        reviewed_at = CURRENT_TIMESTAMP,
                        notes = ?
                    WHERE id = ?
                ''', (reviewed_by, notes, search_id))
                conn.commit()
                
                if cursor.rowcount > 0:
                    return {'success': True, 'message': 'Search marked as reviewed'}
                return {'success': False, 'message': 'Search not found'}
        except Exception as e:
            return {'success': False, 'message': str(e)}

    def delete_user_search(self, search_id: int) -> Dict:
        """Delete a user search record"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM user_searches WHERE id = ?', (search_id,))
                conn.commit()
                
                if cursor.rowcount > 0:
                    return {'success': True, 'message': 'Search deleted'}
                return {'success': False, 'message': 'Search not found'}
        except Exception as e:
            return {'success': False, 'message': str(e)}   
    
    def get_synonyms(self, word: str, language: str = 'english') -> List[Dict]:
        """
        Get all synonyms for a word (both directions)
        Returns list of synonym relationships
        """
        word = word.lower().strip()
        
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get words that are synonyms OF this word
            # Example: if word='delicious', find all words where synonym_of='delicious'
            cursor.execute('''
                SELECT word as synonym, synonym_of as target, 'is_synonym_of' as relationship
                FROM synonyms 
                WHERE synonym_of = ? AND language = ?
                ORDER BY word
            ''', (word, language))
            
            results = [dict(row) for row in cursor.fetchall()]
            
            # Get words that THIS word is a synonym OF
            # Example: if word='tasty', find all words where word='tasty'
            cursor.execute('''
                SELECT synonym_of as target, word as synonym, 'has_synonym' as relationship
                FROM synonyms 
                WHERE word = ? AND language = ?
                ORDER BY synonym_of
            ''', (word, language))
            
            results.extend([dict(row) for row in cursor.fetchall()])
            
            return results
    
    def get_all_synonym_pairs(self) -> List[Dict]:
        """Get all synonym pairs for admin display"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT s.*, 
                       strftime('%Y-%m-%d %H:%M', s.created_at) as created_formatted
                FROM synonyms s
                ORDER BY s.created_at DESC
            ''')
            return [dict(row) for row in cursor.fetchall()]
    
    def delete_synonym(self, synonym_id: int) -> Dict:
        """Delete a synonym relationship"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('DELETE FROM synonyms WHERE id = ?', (synonym_id,))
                conn.commit()
                
                if cursor.rowcount > 0:
                    return {'success': True, 'message': 'Synonym deleted successfully'}
                return {'success': False, 'message': 'Synonym not found'}
        except Exception as e:
            return {'success': False, 'message': str(e)}
    
    def search_synonyms(self, query: str) -> List[Dict]:
        """Search synonyms by word"""
        query = f"%{query.lower()}%"
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM synonyms 
                WHERE word LIKE ? OR synonym_of LIKE ?
                ORDER BY word
                LIMIT 50
            ''', (query, query))
            return [dict(row) for row in cursor.fetchall()]

    # ========== 5-LAYER TRANSLATION WITH AI FALLBACK ==========
    
    def _check_offline_dict(self, text: str, from_runyankore: bool = True) -> Dict:
        """
        Check offline dictionary - returns dict with result
        This is LAYER 1 of the translation system
        """
        text_lower = text.lower()
        
        offline_dict = {
            'run_to_en': {
                'yebare': 'thank you',
                'agandi': 'how are you',
                'oraire': 'good morning',
                'ndi': 'i am',
                'gye': 'fine',
                'nyowe': 'me',
                'iwe': 'you',
                'enkoko': 'chicken',
                'ente': 'cow',
                'enju': 'house',
                'amaizi': 'water',
                'eishomero': 'school',
            },
            'en_to_run': {
                'hello': 'agandi',
                'thank you': 'yebare',
                'good morning': 'oraire',
                'how are you': 'agandi',
                'i am': 'ndi',
                'fine': 'gye',
                'cow': 'ente',
                'chicken': 'enkoko',
                'house': 'enju',
                'water': 'amaizi',
                'school': 'eishomero',
            }
        }
        
        if from_runyankore:
            translation = offline_dict['run_to_en'].get(text_lower)
        else:
            translation = offline_dict['en_to_run'].get(text_lower)
        
        if translation:
            return {'found': True, 'translation': translation}
        
        return {'found': False, 'translation': None}
    
    def translate_with_ai_fallback(self, text: str, from_runyankore: bool = True, use_ai: bool = True) -> Dict:
        """
        5-LAYER TRANSLATION SYSTEM (UPDATED WITH DYNAMIC SYNONYMS):
        1. Offline dictionary (fastest)
        2. SQLite database (exact matches)
        3. Contraction expansion (for English)
        4. Dynamic synonym matching (from database)
        5. AI prediction (fallback)
        """
        if not text or not text.strip():
            return {
                'success': False,
                'error': 'No text provided',
                'original': '',
                'translation': '',
                'confidence': 0.0,
                'source': 'none',
                'layer': 0
            }
        
        text = text.strip()
        original_text = text
        
        # LAYER 1: Offline dictionary check
        offline_result = self._check_offline_dict(text, from_runyankore)
        if offline_result['found']:
            return {
                'success': True,
                'original': original_text,
                'translation': offline_result['translation'],
                'confidence': 1.0,
                'source': 'offline_dict',
                'match_type': 'exact',
                'layer': 1
            }
        
        # LAYER 2: SQLite database check (exact match)
        sqlite_trans = self.get_translation(text, from_runyankore)
        if sqlite_trans:
            return {
                'success': True,
                'original': original_text,
                'translation': sqlite_trans,
                'confidence': 1.0,
                'source': 'sqlite_db',
                'match_type': 'exact',
                'layer': 2
            }
        
        # LAYER 3: CONTRACTION EXPANSION (for English only)
        if not from_runyankore:
            expanded_text = self.expand_contractions(text)
            if expanded_text != text.lower():
                sqlite_trans = self.get_translation(expanded_text, from_runyankore)
                if sqlite_trans:
                    return {
                        'success': True,
                        'original': original_text,
                        'translation': sqlite_trans,
                        'confidence': 0.95,
                        'source': 'contraction_expansion',
                        'match_type': 'expanded',
                        'expanded_from': expanded_text,
                        'layer': 3
                    }
        
        # LAYER 4: DYNAMIC SYNONYM MATCHING (from database)
        synonym_result = self._dynamic_synonym_match(text, from_runyankore)
        if synonym_result['success']:
            return {
                'success': True,
                'original': original_text,
                'translation': synonym_result['translation'],
                'confidence': synonym_result['confidence'],
                'source': 'dynamic_synonym',
                'match_type': 'synonym',
                'matched_word': synonym_result.get('matched_word'),
                'relationship': synonym_result.get('relationship'),
                'layer': 4
            }
        
        # LAYER 5: AI prediction (only if enabled)
        if not use_ai:
            return {
                'success': False,
                'original': original_text,
                'translation': None,
                'confidence': 0.0,
                'source': 'none',
                'match_type': 'none',
                'layer': 4,
                'message': 'Translation not found (AI disabled)'
            }
        
        ai_result = self._ai_predict_translation(text, from_runyankore)
        
        if ai_result['success']:
            return {
                'success': True,
                'original': original_text,
                'translation': ai_result['translation'],
                'confidence': ai_result['confidence'],
                'source': 'ai_fallback',
                'match_type': ai_result['method'],
                'layer': 5,
                'ai_details': {
                    'method': ai_result.get('method'),
                    'confidence': ai_result['confidence']
                }
            }
        else:
            return {
                'success': False,
                'original': original_text,
                'translation': None,
                'confidence': 0.0,
                'source': 'ai_fallback',
                'match_type': 'failed',
                'layer': 5,
                'message': 'AI could not generate translation'
            }
    
    def _dynamic_synonym_match(self, text: str, from_runyankore: bool = True) -> Dict:
        """
        Match translation using database synonyms (simplified and fixed)
        Example: if 'tasty' is synonym of 'delicious', and 'delicious' = 'birungi'
        Then 'tasty' → 'birungi'
        """
        text_lower = text.lower().strip()
        
        # Only process English input for synonyms
        if from_runyankore:
            return {'success': False}
        
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # SIMPLE: Find what word this is a synonym of
            # Example: "tasty" → find its target word "delicious"
            cursor.execute('''
                SELECT synonym_of FROM synonyms 
                WHERE word = ? AND language = 'english'
            ''', (text_lower,))
            
            result = cursor.fetchone()
            if result:
                target_word = result[0]
                # Get translation for the target word
                translation = self.get_translation(target_word, from_runyankore=False)
                if translation:
                    return {
                        'success': True,
                        'translation': translation,
                        'confidence': 0.9,
                        'matched_word': target_word,
                        'relationship': f'"{text_lower}" is synonym of "{target_word}"'
                    }
            
            # Also check reverse (if someone added it backwards)
            cursor.execute('''
                SELECT word FROM synonyms 
                WHERE synonym_of = ? AND language = 'english'
            ''', (text_lower,))
            
            result = cursor.fetchone()
            if result:
                # This word is the target of some synonym
                # Example: "delicious" has synonym "tasty"
                # But we want translation of "delicious" itself
                translation = self.get_translation(text_lower, from_runyankore=False)
                if translation:
                    return {
                        'success': True,
                        'translation': translation,
                        'confidence': 0.95,
                        'matched_word': text_lower,
                        'relationship': f'"{text_lower}" has synonyms'
                    }
        
        return {'success': False}
    
    def _ai_predict_translation(self, text: str, from_runyankore: bool = True) -> Dict:
        """
        AI prediction - LAYER 5 of translation system
        Uses similarity matching and word-by-word translation
        """
        text_lower = text.lower()
        
        # METHOD 1: Find similar words in database
        similar_result = self._find_similar_words_ai(text_lower, from_runyankore)
        if similar_result and similar_result['confidence'] > 0.6:
            return {
                'success': True,
                'translation': similar_result['translation'],
                'confidence': similar_result['confidence'],
                'method': 'similarity_match',
                'matched_word': similar_result['matched_word']
            }
        
        # METHOD 2: Word-by-word translation for phrases
        if ' ' in text_lower:
            word_result = self._translate_word_by_word_ai(text, from_runyankore)
            if word_result['confidence'] > 0.3:
                return {
                    'success': True,
                    'translation': word_result['translation'],
                    'confidence': word_result['confidence'],
                    'method': 'word_by_word',
                    'words_translated': word_result['words_translated'],
                    'total_words': word_result['total_words']
                }
        
        # No AI prediction possible
        return {
            'success': False,
            'translation': f'[No translation found] "{text}"',
            'confidence': 0.0,
            'method': 'failed'
        }
    
    def _find_similar_words_ai(self, text: str, from_runyankore: bool = True) -> Optional[Dict]:
        """
        Find similar words using fuzzy matching on database
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                cursor.execute('''
                    SELECT runyankore, english 
                    FROM translations 
                    WHERE is_deleted = FALSE AND needs_review = FALSE
                ''')
                
                best_match = None
                best_similarity = 0
                
                for row in cursor.fetchall():
                    if from_runyankore:
                        compare_text = row['runyankore'].lower()
                    else:
                        compare_text = row['english'].lower()
                    
                    similarity = SequenceMatcher(None, text, compare_text).ratio()
                    
                    if text in compare_text or compare_text in text:
                        similarity = min(0.95, similarity + 0.15)
                    
                    if similarity > best_similarity:
                        best_similarity = similarity
                        best_match = row
                
                if best_match and best_similarity > 0.6:
                    if from_runyankore:
                        return {
                            'translation': best_match['english'],
                            'confidence': best_similarity * 0.9,
                            'matched_word': best_match['runyankore']
                        }
                    else:
                        return {
                            'translation': best_match['runyankore'],
                            'confidence': best_similarity * 0.9,
                            'matched_word': best_match['english']
                        }
                
                return None
        except Exception as e:
            print(f"AI similarity search error: {e}")
            return None
    
    def _translate_word_by_word_ai(self, text: str, from_runyankore: bool = True) -> Dict:
        """
        Translate phrase word by word using database
        """
        words = text.split()
        translated_words = []
        translated_count = 0
        
        for word in words:
            word_translation = self.get_translation(word, from_runyankore)
            if word_translation:
                translated_words.append(word_translation)
                translated_count += 1
            else:
                translated_words.append(f"[{word}]")
        
        translation = ' '.join(translated_words)
        
        if len(words) > 0:
            confidence = (translated_count / len(words)) * 0.8
        else:
            confidence = 0
        
        return {
            'translation': translation,
            'confidence': confidence,
            'words_translated': translated_count,
            'total_words': len(words)
        }
    
    def ai_search_translations(self, query: str, limit: int = 10) -> List[Dict]:
        """
        AI-powered search with similarity scoring
        """
        if not query or not query.strip():
            return []
        
        query_lower = query.lower()
        results = []
        
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT runyankore, english, category 
                FROM translations 
                WHERE is_deleted = FALSE AND needs_review = FALSE
            ''')
            
            for row in cursor.fetchall():
                runyankore_sim = SequenceMatcher(None, query_lower, row['runyankore'].lower()).ratio()
                english_sim = SequenceMatcher(None, query_lower, row['english'].lower()).ratio()
                
                max_similarity = max(runyankore_sim, english_sim)
                
                if max_similarity > 0.4:
                    match_type = "runyankore" if runyankore_sim > english_sim else "english"
                    
                    results.append({
                        'runyankore': row['runyankore'],
                        'english': row['english'],
                        'category': row['category'],
                        'similarity': max_similarity,
                        'match_type': match_type
                    })
        
        results.sort(key=lambda x: x['similarity'], reverse=True)
        return results[:limit]

 # ========== FEEDBACK SYSTEM METHODS ==========
    
    def save_feedback(self, name, email, feedback_type, message, ip_address, user_agent, user_token):
        """Save user feedback"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO user_feedback 
                    (name, email, feedback_type, message, ip_address, user_agent, user_token, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ''', (name, email, feedback_type, message, ip_address, user_agent, user_token))
                conn.commit()
                return {'success': True, 'id': cursor.lastrowid}
        except Exception as e:
            print(f"Error saving feedback: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_user_feedback(self, user_token, limit=50):
        """Get feedback for a specific user (for user history view)"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM user_feedback 
                WHERE user_token = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            ''', (user_token, limit))
            return [dict(row) for row in cursor.fetchall()]
    
    def get_all_feedback(self, limit=500, include_read=True, feedback_type=None):
        """Get all feedback (admin only)"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            query = "SELECT * FROM user_feedback WHERE 1=1"
            params = []
            
            if not include_read:
                query += " AND is_read = FALSE"
            
            if feedback_type and feedback_type != 'all':
                query += " AND feedback_type = ?"
                params.append(feedback_type)
            
            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)
            
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
    
    def get_feedback_stats(self):
        """Get feedback statistics (admin only)"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            stats = {}
            
            cursor.execute('SELECT COUNT(*) FROM user_feedback')
            stats['total'] = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(*) FROM user_feedback WHERE is_read = FALSE')
            stats['unread'] = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(*) FROM user_feedback WHERE is_replied = TRUE')
            stats['replied'] = cursor.fetchone()[0]
            
            cursor.execute('''
                SELECT feedback_type, COUNT(*) as count 
                FROM user_feedback 
                GROUP BY feedback_type
            ''')
            stats['by_type'] = [dict(row) for row in cursor.fetchall()]
            
            return stats
    
    def mark_feedback_read(self, feedback_id):
        """Mark feedback as read (admin only)"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE user_feedback 
                    SET is_read = TRUE 
                    WHERE id = ?
                ''', (feedback_id,))
                conn.commit()
                return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def reply_to_feedback(self, feedback_id, admin_reply, replied_by):
        """Reply to feedback (admin only)"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE user_feedback 
                    SET admin_reply = ?, 
                        is_replied = TRUE, 
                        replied_at = CURRENT_TIMESTAMP,
                        replied_by = ?,
                        is_read = TRUE
                    WHERE id = ?
                ''', (admin_reply, replied_by, feedback_id))
                conn.commit()
                
                # Get user email to send notification
                cursor.execute('SELECT email FROM user_feedback WHERE id = ?', (feedback_id,))
                result = cursor.fetchone()
                
                return {
                    'success': True,
                    'email': result['email'] if result else None
                }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def delete_feedback(self, feedback_id, user_token=None, is_admin=False):
        """Delete feedback - users can only delete their own, admin can delete any"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                if is_admin:
                    cursor.execute('DELETE FROM user_feedback WHERE id = ?', (feedback_id,))
                else:
                    cursor.execute('''
                        DELETE FROM user_feedback 
                        WHERE id = ? AND user_token = ?
                    ''', (feedback_id, user_token))
                
                conn.commit()
                return {'success': True, 'deleted': cursor.rowcount > 0}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def bulk_delete_feedback(self, feedback_ids, is_admin=False):
        """Bulk delete feedback (admin only)"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                placeholders = ','.join(['?'] * len(feedback_ids))
                query = f'DELETE FROM user_feedback WHERE id IN ({placeholders})'
                cursor.execute(query, feedback_ids)
                conn.commit()
                return {'success': True, 'deleted_count': cursor.rowcount}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    
    def execute_query(self, query: str, params: tuple = ()) -> bool:
        """Execute a query that doesn't return results (INSERT, UPDATE, DELETE)"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                conn.commit()
                return True
        except Exception as e:
            print(f"Database execute error: {e}")
            return False
    
    def fetch_one(self, query: str, params: tuple = ()) -> Optional[Dict]:
        """Fetch a single row from database"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                row = cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            print(f"Database fetch_one error: {e}")
            return None
    
    def fetch_all(self, query: str, params: tuple = ()) -> List[Dict]:
        """Fetch all rows from database"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            print(f"Database fetch_all error: {e}")
            return []
    
# Singleton instance for database
_db_instance = None

def get_database():
    """Get database singleton instance"""
    global _db_instance
    if _db_instance is None:
        _db_instance = TranslationDB()
    return _db_instance

def migrate_json_to_sqlite(json_path: str) -> int:
    """Migrate JSON dictionary to SQLite database"""
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            translations = json.load(f)
        
        db = get_database()
        
        if isinstance(translations, dict):
            translations_list = []
            for runyankore, english in translations.items():
                translations_list.append({
                    'runyankore': runyankore,
                    'english': english,
                    'category': 'general',
                    'needs_review': False,
                    'added_by': 'migration'
                })
            imported = db.bulk_import(translations_list)
        elif isinstance(translations, list):
            for translation in translations:
                translation['needs_review'] = translation.get('needs_review', False)
                translation['added_by'] = translation.get('added_by', 'migration')
            imported = db.bulk_import(translations)
        else:
            print("❌ Invalid JSON format")
            return 0
        
        print(f"✅ Imported {imported} translations from JSON to SQLite")
        return imported
        
    except FileNotFoundError:
        print(f"❌ JSON file not found: {json_path}")
        return 0
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON file: {e}")
        return 0
    except Exception as e:
        print(f"❌ Failed to import JSON: {e}")
        return 0