import sqlite3
from datetime import datetime
from flask import jsonify

class Database:
    def __init__(self, db_name="weiss_multimarcas.db"):
        self.db_name = db_name
        self.create_tables()

    def connect(self):
        return sqlite3.connect(self.db_name)

    def create_tables(self):
        with self.connect() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS cars (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    year TEXT,
                    description TEXT,
                    price TEXT,
                    images TEXT
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS clients (
                    chat_id TEXT PRIMARY KEY,
                    message TEXT,
                    response TEXT,
                    interests TEXT,
                    state TEXT,
                    last_interaction TIMESTAMP,
                    report TEXT
                )
            ''')
            conn.commit()

    def add_car(self, name, year, description, price, images):
        with self.connect() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO cars (name, year, description, price, images)
                VALUES (?, ?, ?, ?, ?)
            ''', (name, year, description, price, ','.join(images)))
            conn.commit()
            return cursor.lastrowid

    def get_cars(self):
        with self.connect() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM cars')
            return [{'id': row[0], 'name': row[1], 'year': row[2], 'description': row[3], 'price': row[4], 'images': row[5].split(',') if row[5] else []} for row in cursor.fetchall()]

    def delete_car(self, car_id):
        with self.connect() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM cars WHERE id = ?', (car_id,))
            conn.commit()
            return cursor.rowcount > 0

    def add_client(self, chat_id, message, response, interests, state, report=''):
        with self.connect() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO clients (chat_id, message, response, interests, state, last_interaction, report)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (chat_id, message, response, ','.join(interests) if interests else '', state, datetime.now(), report))
            conn.commit()

    def get_client(self, chat_id):
        with self.connect() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM clients WHERE chat_id = ?', (chat_id,))
            row = cursor.fetchone()
            if row:
                return {
                    'chat_id': row[0],
                    'message': row[1],
                    'response': row[2],
                    'interests': row[3].split(',') if row[3] else [],
                    'state': row[4],
                    'last_interaction': row[5],
                    'report': row[6]
                }
            return None

    def delete_client(self, chat_id):
        with self.connect() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM clients WHERE chat_id = ?', (chat_id,))
            conn.commit()
            return cursor.rowcount > 0

def init_db(app):
    db = Database()
    app.db = db

    @app.route('/api/cars', methods=['GET'])
    def get_cars():
        cars = db.get_cars()
        return jsonify(cars)

    @app.route('/api/cars', methods=['POST'])
    def add_car_route():
        data = request.get_json()
        car_id = db.add_car(
            data['name'],
            data.get('year', ''),
            data.get('description', ''),
            data.get('price', ''),
            data.get('images', [])
        )
        return jsonify({'id': car_id}), 201

    @app.route('/api/cars/<int:car_id>', methods=['DELETE'])
    def delete_car_route(car_id):
        if db.delete_car(car_id):
            return '', 204
        return jsonify({'error': 'Carro não encontrado'}), 404

    @app.route('/api/clients/<chat_id>', methods=['GET'])
    def get_client_route(chat_id):
        client = db.get_client(chat_id)
        if client:
            return jsonify(client)
        return jsonify({'error': 'Cliente não encontrado'}), 404

    @app.route('/api/clients', methods=['POST'])
    def add_client_route():
        data = request.get_json()
        db.add_client(
            data['chat_id'],
            data.get('message', ''),
            data.get('response', ''),
            data.get('interests', []),
            data.get('state', 'inicial'),
            data.get('report', '')
        )
        return '', 201

    @app.route('/api/clients/<chat_id>', methods=['DELETE'])
    def delete_client_route(chat_id):
        if db.delete_client(chat_id):
            return '', 204
        return jsonify({'error': 'Cliente não encontrado'}), 404