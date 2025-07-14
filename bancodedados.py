import sqlite3
from datetime import datetime
from flask import jsonify, request
import json
import os

class Database:
    def __init__(self, db_name="weiss_multimarcas.db"):
        self.db_name = db_name
        self.clientes_json = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clientes.json')
        self.create_tables()
        self.migrate_schema()

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
                    last_interaction TIMESTAMP
                )
            ''')
            conn.commit()

    def migrate_schema(self):
        with self.connect() as conn:
            cursor = conn.cursor()
            # Verificar e adicionar colunas ausentes na tabela clients
            cursor.execute("PRAGMA table_info(clients)")
            columns = [col[1] for col in cursor.fetchall()]
            if 'report' not in columns:
                cursor.execute('ALTER TABLE clients ADD COLUMN report TEXT')
            if 'name' not in columns:
                cursor.execute('ALTER TABLE clients ADD COLUMN name TEXT')
            if 'phone' not in columns:
                cursor.execute('ALTER TABLE clients ADD COLUMN phone TEXT')
            if 'cpf' not in columns:
                cursor.execute('ALTER TABLE clients ADD COLUMN cpf TEXT')
            if 'job' not in columns:
                cursor.execute('ALTER TABLE clients ADD COLUMN job TEXT')
            if 'documents' not in columns:
                cursor.execute('ALTER TABLE clients ADD COLUMN documents TEXT')
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

    def get_clientes_data(self):
        if os.path.exists(self.clientes_json):
            try:
                with open(self.clientes_json, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Erro ao carregar clientes.json: {e}")
                return {"clients": []}
        return {"clients": []}

    def add_client(self, chat_id, message, response, interests, state, report='', documents=None, name='', phone='', cpf='', job=''):
        with self.connect() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO clients (chat_id, message, response, interests, state, last_interaction, report, name, phone, cpf, job, documents)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (chat_id, message, response, json.dumps(interests), state, datetime.now(), report, name, phone, cpf, job, json.dumps(documents or [])))
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
                    'interests': json.loads(row[3]) if row[3] else {},
                    'state': row[4],
                    'last_interaction': row[5],
                    'report': row[6] if len(row) > 6 else '',
                    'name': row[7] if len(row) > 7 else '',
                    'phone': row[8] if len(row) > 8 else '',
                    'cpf': row[9] if len(row) > 9 else '',
                    'job': row[10] if len(row) > 10 else '',
                    'documents': json.loads(row[11]) if len(row) > 11 and row[11] else []
                }
            return None

    def update_client(self, chat_id, message=None, response=None, interests=None, state=None, report=None, documents=None, name=None, phone=None, cpf=None, job=None):
        with self.connect() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM clients WHERE chat_id = ?', (chat_id,))
            client = cursor.fetchone()
            if not client:
                return False
            cursor.execute('''
                UPDATE clients SET
                    message = ?,
                    response = ?,
                    interests = ?,
                    state = ?,
                    last_interaction = ?,
                    report = ?,
                    name = ?,
                    phone = ?,
                    cpf = ?,
                    job = ?,
                    documents = ?
                WHERE chat_id = ?
            ''', (
                message if message is not None else client[1],
                response if response is not None else client[2],
                json.dumps(interests) if interests is not None else client[3],
                state if state is not None else client[4],
                datetime.now(),
                report if report is not None else (client[6] if len(client) > 6 else ''),
                name if name is not None else (client[7] if len(client) > 7 else ''),
                phone if phone is not None else (client[8] if len(client) > 8 else ''),
                cpf if cpf is not None else (client[9] if len(client) > 9 else ''),
                job if job is not None else (client[10] if len(client) > 10 else ''),
                json.dumps(documents) if documents is not None else (client[11] if len(client) > 11 else '[]'),
                chat_id
            ))
            conn.commit()
            return True

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

    @app.route('/api/clients/data', methods=['GET'])
    def get_clientes_data_route():
        return jsonify(db.get_clientes_data())

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
            data.get('interests', {}),
            data.get('state', 'inicial'),
            data.get('report', ''),
            data.get('documents', []),
            data.get('name', ''),
            data.get('phone', ''),
            data.get('cpf', ''),
            data.get('job', '')
        )
        return '', 201

    @app.route('/api/clients/<chat_id>', methods=['PUT'])
    def update_client_route(chat_id):
        data = request.get_json()
        if db.update_client(
            chat_id,
            data.get('message'),
            data.get('response'),
            data.get('interests'),
            data.get('state'),
            data.get('report'),
            data.get('documents'),
            data.get('name'),
            data.get('phone'),
            data.get('cpf'),
            data.get('job')
        ):
            return jsonify(data), 200
        return jsonify({'error': 'Cliente não encontrado'}), 404

    @app.route('/api/clients/<chat_id>', methods=['DELETE'])
    def delete_client_route(chat_id):
        if db.delete_client(chat_id):
            return '', 204
        return jsonify({'error': 'Cliente não encontrado'}), 404