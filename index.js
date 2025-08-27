// .env 파일의 환경 변수를 process.env에 로드합니다.
require('dotenv').config();

// 1. 필요한 라이브러리들을 모두 불러옵니다.
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');

// 2. express 앱을 생성합니다.
const app = express();

// 3. 생성된 app에 미들웨어를 적용합니다.
app.use(cors());
app.use(express.json()); // JSON 파서 (한번만 호출)

// 4. Firebase SDK를 초기화합니다.
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const port = 3000;

// 데이터베이스 연결 설정
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
};

// 데이터베이스 연결 풀(Pool) 생성
const pool = mysql.createPool(dbConfig);

// --- 인증 미들웨어 ---
async function checkAuth(req, res, next) {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided.' });
  }
  const idToken = req.headers.authorization.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const [users] = await pool.query('SELECT * FROM users WHERE firebase_uid = ?', [decodedToken.uid]);
    if (users.length === 0) {
        return res.status(404).json({ error: 'User not found in our database.' });
    }
    req.user = users[0];
    next();
  } catch (error) {
    console.error('Error verifying token or fetching user:', error);
    return res.status(403).json({ error: 'Forbidden: Invalid token or user mismatch.' });
  }
}

// [공통 로직] - 권한 확인 함수
async function checkOwnership(pool, table, column, reportId, userId) {
    const sql = `SELECT ${column} FROM ${table} WHERE id = ?`;
    const [rows] = await pool.query(sql, [reportId]);
    if (rows.length === 0) {
        const error = new Error('NOT_FOUND');
        throw error;
    }
    if (rows[0][column] !== userId) {
        const error = new Error('FORBIDDEN');
        throw error;
    }
    return true;
}

// --- API 라우트(경로) 정의 시작 ---



// [사용자 API]
app.post('/api/auth/register', async (req, res) => {
    const { phone_number, real_name, nickname, ci, firebase_uid } = req.body;
    if (!phone_number || !real_name || !nickname || !ci || !firebase_uid) {
        return res.status(400).json({ error: 'Required fields are missing.' });
    }
    try {
        const checkSql = 'SELECT id FROM users WHERE nickname = ? OR ci = ? OR firebase_uid = ?';
        const [existingUsers] = await pool.query(checkSql, [nickname, ci, firebase_uid]);
        if (existingUsers.length > 0) {
            return res.status(409).json({ error: 'User with this info already exists.' });
        }
        const insertSql = `INSERT INTO users (phone_number, real_name, nickname, ci, firebase_uid) VALUES (?, ?, ?, ?, ?)`;
        const [result] = await pool.query(insertSql, [phone_number, real_name, nickname, ci, firebase_uid]);
        res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
    } catch (error) {
        console.error('Error during user registration:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/users/me', checkAuth, async (req, res) => {
    const { id, firebase_uid, phone_number, real_name, nickname, profile_image_url, created_at } = req.user;
    res.json({ id, firebase_uid, phone_number, real_name, nickname, profile_image_url, created_at });
});

app.patch('/api/users/me', checkAuth, async (req, res) => {
    const userId = req.user.id;
    const { nickname, profile_image_url } = req.body;
    if (!nickname && !profile_image_url) {
        return res.status(400).json({ error: 'No fields to update.' });
    }
    try {
        let fieldsToUpdate = [];
        const values = [];
        if (nickname) {
            fieldsToUpdate.push('nickname = ?');
            values.push(nickname);
        }
        if (profile_image_url) {
            fieldsToUpdate.push('profile_image_url = ?');
            values.push(profile_image_url);
        }
        values.push(userId);
        const sql = `UPDATE users SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
        const [result] = await pool.query(sql, values);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Nickname already exists.' });
        console.error('Error updating user profile:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/users/me', checkAuth, async (req, res) => {
    const userId = req.user.id;
    try {
        const sql = 'UPDATE users SET is_active = false WHERE id = ?';
        const [result] = await pool.query(sql, [userId]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
        res.status(200).json({ message: 'User account deactivated successfully.' });
    } catch (error) {
        console.error('Error deactivating user account:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// [실종자 관련 API]
app.post('/api/missing-persons', checkAuth, async (req, res) => {
    const reporter_id = req.user.id;
    const { missing_person_name, gender, age_at_missing, height, weight, last_seen_at, last_seen_location, description, main_photo_url } = req.body;
    if (!missing_person_name || !last_seen_at || !last_seen_location) {
        return res.status(400).json({ error: 'Required fields are missing.' });
    }
    try {
        const sql = `INSERT INTO missing_persons (reporter_id, missing_person_name, gender, age_at_missing, height, weight, last_seen_at, last_seen_location, description, main_photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [reporter_id, missing_person_name, gender, age_at_missing, height, weight, last_seen_at, last_seen_location, description, main_photo_url];
        const [result] = await pool.query(sql, values);
        res.status(201).json({ message: 'Missing person report registered successfully', reportId: result.insertId });
    } catch (error) {
        console.error('Error registering missing person:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 실종자 목록 조회 API
app.get('/api/missing-persons', async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 20;
    try {
        // [수정] 앱이 알아들을 수 있도록 personName, animalName 별명을 사용합니다.
        const sql = `
            SELECT 
                id, 
                'person' as type, 
                missing_person_name AS personName, 
                null as animalName,
                age_at_missing, 
                last_seen_location, 
                main_photo_url, 
                created_at 
            FROM missing_persons 
            WHERE status = 'missing' 
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        const [rows] = await pool.query(sql, [limit]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching missing persons list:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.get('/api/missing-persons/:id', async (req, res) => {
    try {
        const sql = 'SELECT * FROM missing_persons WHERE id = ?';
        const [rows] = await pool.query(sql, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Report not found' });
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching missing person details:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
// =============================================
// --- 실종자 정보 수정 API (부분 수정) ---
// =============================================
app.patch('/api/missing-persons/:id', checkAuth, async (req, res) => {
    try {
        // 1. 게시물의 소유주가 맞는지 먼저 확인합니다.
        await checkOwnership(pool, 'missing_persons', 'reporter_id', req.params.id, req.user.id);

        // 2. 요청 body에 어떤 필드가 포함되었는지 동적으로 확인합니다.
        const fieldsToUpdate = [];
        const values = [];
        const { status, missing_person_name, gender, age_at_missing, height, weight, last_seen_at, last_seen_location, description, main_photo_url } = req.body;

        if (status !== undefined) { fieldsToUpdate.push('status = ?'); values.push(status); }
        if (missing_person_name !== undefined) { fieldsToUpdate.push('missing_person_name = ?'); values.push(missing_person_name); }
        if (gender !== undefined) { fieldsToUpdate.push('gender = ?'); values.push(gender); }
        if (age_at_missing !== undefined) { fieldsToUpdate.push('age_at_missing = ?'); values.push(age_at_missing); }
        if (height !== undefined) { fieldsToUpdate.push('height = ?'); values.push(height); }
        if (weight !== undefined) { fieldsToUpdate.push('weight = ?'); values.push(weight); }
        if (last_seen_at !== undefined) { fieldsToUpdate.push('last_seen_at = ?'); values.push(last_seen_at); }
        if (last_seen_location !== undefined) { fieldsToUpdate.push('last_seen_location = ?'); values.push(last_seen_location); }
        if (description !== undefined) { fieldsToUpdate.push('description = ?'); values.push(description); }
        if (main_photo_url !== undefined) { fieldsToUpdate.push('main_photo_url = ?'); values.push(main_photo_url); }
        
        // 수정할 내용이 하나도 없으면 400 에러를 보냅니다.
        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: 'No fields to update provided.' });
        }

        // 3. 동적으로 생성된 SQL을 실행합니다.
        const sql = `UPDATE missing_persons SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
        values.push(req.params.id);

        await pool.query(sql, values);
        res.json({ message: 'Report updated successfully' });

    } catch (error) {
        if (error.message === 'NOT_FOUND') return res.status(404).json({ error: 'Report not found.' });
        if (error.message === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden. You do not have permission to edit this report.' });
        console.error('Error updating report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.delete('/api/missing-persons/:id', checkAuth, async (req, res) => {
    try {
        await checkOwnership(pool, 'missing_persons', 'reporter_id', req.params.id, req.user.id);
        const deleteSql = 'DELETE FROM missing_persons WHERE id = ?';
        await pool.query(deleteSql, [req.params.id]);
        res.status(200).json({ message: 'Report deleted successfully' });
    } catch (error) {
        if (error.message === 'NOT_FOUND') return res.status(404).json({ error: 'Report not found.' });
        if (error.message === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden. You do not have permission to delete this report.' });
        console.error('Error deleting report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
// =============================================
// --- 실종 동물 관련 API ---
// =============================================

// 실종 동물 정보 등록 API (인증 필요)
app.post('/api/missing-animals', checkAuth, async (req, res) => {
    const owner_id = req.user.id;
    const { animal_type, breed, animal_name, gender, age, last_seen_at, last_seen_location, description, main_photo_url } = req.body;

    if (!animal_type || !last_seen_at || !last_seen_location) {
        return res.status(400).json({ error: 'Missing required fields: animal_type, last_seen_at, last_seen_location are required.' });
    }

    try {
        const sql = `INSERT INTO missing_animals (owner_id, animal_type, breed, animal_name, gender, age, last_seen_at, last_seen_location, description, main_photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [owner_id, animal_type, breed, animal_name, gender, age, last_seen_at, last_seen_location, description, main_photo_url];
        const [result] = await pool.query(sql, values);
        res.status(201).json({
            message: 'Missing animal report registered successfully',
            reportId: result.insertId
        });
    } catch (error) {
        console.error('Error registering missing animal:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
// 실종 동물 목록 조회 API
app.get('/api/missing-animals', async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 20;
    try {
        // [수정] 앱이 알아들을 수 있도록 personName, animalName 별명을 사용합니다.
        const sql = `
            SELECT 
                id, 
                'animal' as type,
                null as personName,
                animal_name AS animalName,
                breed,
                age,
                last_seen_location, 
                main_photo_url, 
                created_at 
            FROM missing_animals 
            WHERE status = 'missing' 
            ORDER BY created_at DESC
            LIMIT ?
        `;
        const [rows] = await pool.query(sql, [limit]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching missing animals list:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
// 특정 실종 동물 상세 정보 조회 API (인증 필요 없음)
app.get('/api/missing-animals/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const sql = 'SELECT * FROM missing_animals WHERE id = ?';
        const [rows] = await pool.query(sql, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching missing animal details:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
// =============================================
// --- 실종 동물 정보 수정 API (부분 수정) ---
// =============================================
app.patch('/api/missing-animals/:id', checkAuth, async (req, res) => {
    try {
        await checkOwnership(pool, 'missing_animals', 'owner_id', req.params.id, req.user.id);

        const fieldsToUpdate = [];
        const values = [];
        const { status, animal_type, breed, animal_name, gender, age, last_seen_at, last_seen_location, description, main_photo_url } = req.body;

        if (status !== undefined) { fieldsToUpdate.push('status = ?'); values.push(status); }
        if (animal_type !== undefined) { fieldsToUpdate.push('animal_type = ?'); values.push(animal_type); }
        if (breed !== undefined) { fieldsToUpdate.push('breed = ?'); values.push(breed); }
        if (animal_name !== undefined) { fieldsToUpdate.push('animal_name = ?'); values.push(animal_name); }
        if (gender !== undefined) { fieldsToUpdate.push('gender = ?'); values.push(gender); }
        if (age !== undefined) { fieldsToUpdate.push('age = ?'); values.push(age); }
        if (last_seen_at !== undefined) { fieldsToUpdate.push('last_seen_at = ?'); values.push(last_seen_at); }
        if (last_seen_location !== undefined) { fieldsToUpdate.push('last_seen_location = ?'); values.push(last_seen_location); }
        if (description !== undefined) { fieldsToUpdate.push('description = ?'); values.push(description); }
        if (main_photo_url !== undefined) { fieldsToUpdate.push('main_photo_url = ?'); values.push(main_photo_url); }
        
        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: 'No fields to update provided.' });
        }

        const sql = `UPDATE missing_animals SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
        values.push(req.params.id);

        await pool.query(sql, values);
        res.json({ message: 'Animal report updated successfully' });
    } catch (error) {
        if (error.message === 'NOT_FOUND') return res.status(404).json({ error: 'Report not found.' });
        if (error.message === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden. You do not have permission to edit this report.' });
        console.error('Error updating animal report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
// 실종 동물 정보 삭제 API (인증 및 권한 확인 필요)
app.delete('/api/missing-animals/:id', checkAuth, async (req, res) => {
    try {
        // [수정됨] 정확한 테이블('missing_animals')과 컬럼('owner_id')을 확인합니다.
        await checkOwnership(pool, 'missing_animals', 'owner_id', req.params.id, req.user.id);
        
        const deleteSql = 'DELETE FROM missing_animals WHERE id = ?';
        await pool.query(deleteSql, [req.params.id]);
        
        res.status(200).json({ message: 'Animal report deleted successfully' });

    } catch (error) {
        if (error.message === 'NOT_FOUND') return res.status(404).json({ error: 'Report not found.' });
        if (error.message === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden. You do not have permission to delete this report.' });
        console.error('Error deleting animal report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// =============================================
// --- 실종 동물 목격담 관련 API ---
// =============================================

// 특정 실종 동물에 대한 목격담 등록 API (인증 필요)
app.post('/api/missing-animals/:missing_animal_id/sightings', checkAuth, async (req, res) => {
    const { missing_animal_id } = req.params;
    const reporter_id = req.user.id; 
    const { sighting_at, sighting_location, description, sighting_photo_url } = req.body;

    if (!sighting_at || !sighting_location) {
        return res.status(400).json({ error: 'Missing required fields: sighting_at and sighting_location are required.' });
    }

    try {
        const sql = `INSERT INTO animal_sightings (missing_animal_id, reporter_id, sighting_at, sighting_location, description, sighting_photo_url) VALUES (?, ?, ?, ?, ?, ?)`;
        const values = [missing_animal_id, reporter_id, sighting_at, sighting_location, description, sighting_photo_url];
        const [result] = await pool.query(sql, values);
        res.status(201).json({
            message: 'Sighting report for animal registered successfully',
            sightingId: result.insertId
        });
    } catch (error) {
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'The specified missing animal report does not exist.' });
        }
        console.error('Error registering animal sighting:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// [새로 추가] 특정 실종 동물의 목격담 목록 조회 API
app.get('/api/missing-animals/:missing_animal_id/sightings', async (req, res) => {
    const { missing_animal_id } = req.params;
    try {
        const sql = `
            SELECT 
                ans.id, ans.sighting_at, ans.sighting_location, ans.description, ans.sighting_photo_url, ans.created_at,
                u.nickname AS reporter_nickname
            FROM animal_sightings ans
            JOIN users u ON ans.reporter_id = u.id
            WHERE ans.missing_animal_id = ?
            ORDER BY ans.sighting_at DESC
        `;
        const [rows] = await pool.query(sql, [missing_animal_id]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching animal sightings:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// =============================================
// --- 지도 관련 API ---
// =============================================
// 모든 목격담 위치 정보를 가져오는 API (수정된 버전)
app.get('/api/sightings/all', async (req, res) => {
    try {
        // [수정] 어떤 테이블의 id인지 ps.id, anm.id 처럼 명확하게 지정합니다.
        const personSightingsSql = `
            SELECT 
                ps.id, 
                'person' as type, 
                mp.missing_person_name AS name,
                ps.sighting_location, 
                ps.sighting_at 
            FROM person_sightings ps
            JOIN missing_persons mp ON ps.missing_person_id = mp.id
        `;

        const animalSightingsSql = `
            SELECT 
                ans.id, 
                'animal' as type, 
                anm.animal_name AS name,
                ans.sighting_location, 
                ans.sighting_at 
            FROM animal_sightings ans
            JOIN missing_animals anm ON ans.missing_animal_id = anm.id
        `;

        const [personRows] = await pool.query(personSightingsSql);
        const [animalRows] = await pool.query(animalSightingsSql);

        const allSightings = [...personRows, ...animalRows];

        res.json(allSightings);

    } catch (error) {
        console.error('Error fetching all sightings:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// [수정] 내가 작성한 모든 게시물 목록 조회 API
app.get('/api/users/me/posts', checkAuth, async (req, res) => {
    const userId = req.user.id;
    try {
        // [수정] name 대신 personName과 animalName을 사용하도록 SQL 변경
        const sql = `
            (SELECT 
                id, 'person' as type, 
                missing_person_name AS personName,  -- name -> personName
                null as animalName,                 -- animalName 필드 추가
                last_seen_location, main_photo_url, created_at 
            FROM missing_persons WHERE reporter_id = ?)
            UNION ALL
            (SELECT 
                id, 'animal' as type, 
                null as personName,                 -- personName 필드 추가
                animal_name AS animalName,          -- name -> animalName
                last_seen_location, main_photo_url, created_at 
            FROM missing_animals WHERE owner_id = ?)
            ORDER BY created_at DESC;
        `;
        const [rows] = await pool.query(sql, [userId, userId]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching my posts:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

//=============================================================
//	실종자 목격담 등록
//==============================================================
// [새로 추가] 특정 실종자에 대한 목격담 등록 API
// [새로 추가] 특정 실종자에 대한 목격담 등록 API
app.post('/api/missing-persons/:missing_person_id/sightings', checkAuth, async (req, res) => {
    // 1. URL 경로에서 어떤 실종 사건에 대한 제보인지 ID를 가져옵니다.
    const { missing_person_id } = req.params;
    // 2. 인증 미들웨어를 통해 제보자의 ID를 가져옵니다.
    const reporter_id = req.user.id; 
    // 3. 제보 내용을 요청 body에서 가져옵니다.
    const { sighting_at, sighting_location, description, sighting_photo_url } = req.body;

    // 4. 필수 정보가 있는지 확인합니다.
    if (!sighting_at || !sighting_location) {
        return res.status(400).json({ error: 'Missing required fields: sighting_at and sighting_location are required.' });
    }

    try {
        // 5. DB에 INSERT 쿼리를 실행해서 새로운 목격담을 등록합니다.
        const sql = `
            INSERT INTO person_sightings 
            (missing_person_id, reporter_id, sighting_at, sighting_location, description, sighting_photo_url) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const values = [missing_person_id, reporter_id, sighting_at, sighting_location, description, sighting_photo_url];
        const [result] = await pool.query(sql, values);

        res.status(201).json({
            message: 'Sighting report registered successfully',
            sightingId: result.insertId
        });

    } catch (error) {
        // 만약 존재하지 않는 실종 사건 ID로 요청하면 외래 키 제약조건 위반 오류가 발생합니다.
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(404).json({ error: 'The specified missing person report does not exist.' });
        }
        console.error('Error registering sighting:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
// [새로 추가] 특정 실종자의 목격담 목록 조회 API
app.get('/api/missing-persons/:missing_person_id/sightings', async (req, res) => {
    const { missing_person_id } = req.params;
    try {
        const sql = `
            SELECT 
                ps.id, ps.sighting_at, ps.sighting_location, ps.description, ps.sighting_photo_url, ps.created_at,
                u.nickname AS reporter_nickname
            FROM person_sightings ps
            JOIN users u ON ps.reporter_id = u.id
            WHERE ps.missing_person_id = ?
            ORDER BY ps.sighting_at DESC
        `;
        const [rows] = await pool.query(sql, [missing_person_id]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching person sightings:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
// --- API 라우트(경로) 정의 끝 ---


// 서버 실행
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
