const express = require('express');
const axios = require('axios');
const cors = require('cors');

// ================================================================
//  CLASS ULTRA DICE PREDICTION SYSTEM (GIỮ NGUYÊN)
//  (Tôi không paste lại toàn bộ 2000 dòng ở đây để tiết kiệm,
//   nhưng trong file thực tế bạn cần có toàn bộ class này.
//   Bạn đã có ở file trước, hãy copy nguyên class đó vào đây.)
// ================================================================

// ... (chèn toàn bộ class UltraDicePredictionSystem tại đây) ...

// ================================================================
//  SERVER EXPRESS – CẢI TIẾN PARSE DỮ LIỆU
// ================================================================

const app = express();
const port = 3000;
const AUTO_UPDATE_INTERVAL = 30000; // 30 giây

app.use(cors());
app.use(express.json());

const API_URL = 'https://wtxmd52.tele68.com/v1/txmd5/lite-sessions?cp=R&cl=R&pf=web&at=15766f58a95cb4f95975ffcf643f524c';

// ---------- HELPER: trích xuất mảng phiên ----------
function extractSessionsArray(data) {
    if (!data) return [];
    // Nếu là mảng trực tiếp
    if (Array.isArray(data)) return data;
    // Nếu là object, tìm key chứa mảng
    const possibleKeys = ['data', 'list', 'results', 'items', 'sessions', 'rows'];
    for (const key of possibleKeys) {
        if (data[key] && Array.isArray(data[key])) {
            return data[key];
        }
    }
    // Nếu không tìm thấy, thử lấy tất cả giá trị là mảng
    for (const key of Object.keys(data)) {
        if (Array.isArray(data[key])) {
            return data[key];
        }
    }
    return [];
}

// ---------- HELPER: lấy giá trị từ object theo nhiều key ----------
function getValue(obj, keys, fallback = null) {
    if (!obj || typeof obj !== 'object') return fallback;
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null) {
            return obj[key];
        }
    }
    return fallback;
}

// ---------- HÀM CẬP NHẬT DỰ ĐOÁN ----------
let latestPrediction = null;
let lastUpdateTime = null;
let isUpdating = false;

async function fetchAndUpdatePrediction() {
    if (isUpdating) return;
    isUpdating = true;
    try {
        console.log('🔄 Đang gọi API...');
        const response = await axios.get(API_URL);
        const rawData = response.data;

        // Log cấu trúc để debug (chỉ log 1 phần tử đầu)
        console.log('📦 Cấu trúc API (sample):', JSON.stringify(rawData).slice(0, 500));

        // Trích xuất mảng phiên
        let sessions = extractSessionsArray(rawData);
        if (sessions.length === 0) {
            console.warn('⚠️ Không tìm thấy mảng phiên, dùng mặc định');
            latestPrediction = createDefaultPrediction();
            lastUpdateTime = new Date();
            return;
        }

        // Lọc phiên có kết quả hợp lệ
        const validSessions = sessions.filter(s => {
            const result = getValue(s, ['result', 'ketqua', 'ket_qua', 'status', 'outcome'], '').toUpperCase();
            return result === 'T' || result === 'X';
        });

        if (validSessions.length === 0) {
            console.warn('⚠️ Không có phiên nào có kết quả T/X, dùng mặc định');
            const lastSession = sessions[0] || {};
            const phien = getValue(lastSession, ['id', 'session_id', 'sessionId'], 0);
            const dice = getValue(lastSession, ['dice', 'dices', 'xuc_xac', 'numbers', 'value'], '0-0-0');
            latestPrediction = {
                Id: 's2king',
                Phien: phien,
                ket_qua: 'Chưa có',
                Xuc_xac: Array.isArray(dice) ? dice.join('-') : String(dice),
                Phien_moi: phien + 1,
                Du_doan: 'Tài',
                Do_tin_cay: '50.00%'
            };
            lastUpdateTime = new Date();
            return;
        }

        // Khởi tạo hệ thống dự đoán
        const system = new UltraDicePredictionSystem();
        const results = validSessions.map(s => getValue(s, ['result', 'ketqua', 'ket_qua', 'status', 'outcome'], '').toUpperCase());
        for (const r of results) {
            system.addResult(r);
        }

        let prediction = system.getFinalPrediction();
        if (!prediction) {
            const lastResult = results[results.length - 1];
            const fallbackPred = lastResult === 'T' ? 'X' : 'T';
            prediction = {
                prediction: fallbackPred,
                confidence: 0.55,
                reasons: ['Dự đoán dựa trên quy luật đảo chiều cơ bản']
            };
        }

        const lastSession = validSessions[validSessions.length - 1];
        const phien = getValue(lastSession, ['id', 'session_id', 'sessionId'], validSessions.length);
        const phienMoi = phien + 1;
        let dice = getValue(lastSession, ['dice', 'dices', 'xuc_xac', 'numbers', 'value'], [0, 0, 0]);
        if (Array.isArray(dice)) {
            dice = dice.join('-');
        } else if (typeof dice !== 'string') {
            dice = '0-0-0';
        }

        const ketQua = getValue(lastSession, ['result', 'ketqua', 'ket_qua', 'status', 'outcome'], '').toUpperCase() === 'T' ? 'Tài' : 'Xỉu';
        const duDoan = prediction.prediction === 'T' ? 'Tài' : 'Xỉu';
        const doTinCay = (prediction.confidence * 100).toFixed(2) + '%';

        latestPrediction = {
            Id: 's2king',
            Phien: phien,
            ket_qua: ketQua,
            Xuc_xac: dice,
            Phien_moi: phienMoi,
            Du_doan: duDoan,
            Do_tin_cay: doTinCay
        };
        lastUpdateTime = new Date();
        console.log(`✅ Cập nhật dự đoán thành công lúc ${lastUpdateTime.toLocaleString()}`);
        console.log('📊 Dự đoán mới:', latestPrediction);
    } catch (error) {
        console.error('❌ Lỗi cập nhật tự động:', error.message);
        if (error.response) {
            console.error('📄 Status:', error.response.status);
            console.error('📄 Data:', error.response.data);
        }
    } finally {
        isUpdating = false;
    }
}

function createDefaultPrediction() {
    return {
        Id: 's2king',
        Phien: 0,
        ket_qua: 'Chưa có',
        Xuc_xac: '0-0-0',
        Phien_moi: 1,
        Du_doan: 'Tài',
        Do_tin_cay: '50.00%'
    };
}

// Lần đầu chạy sau 1s
setTimeout(fetchAndUpdatePrediction, 1000);
// Tự động cập nhật mỗi 30s
setInterval(fetchAndUpdatePrediction, AUTO_UPDATE_INTERVAL);

// ---------- ENDPOINTS ----------

// Lấy dự đoán mới nhất (không gọi API)
app.get('/latest', (req, res) => {
    if (!latestPrediction) {
        return res.status(503).json({ error: 'Chưa có dự đoán, vui lòng đợi vài giây' });
    }
    res.json({
        ...latestPrediction,
        last_update: lastUpdateTime ? lastUpdateTime.toISOString() : null
    });
});

// Gọi API trực tiếp (có parse linh hoạt)
app.get('/predict', async (req, res) => {
    try {
        console.log('📞 /predict được gọi');
        const response = await axios.get(API_URL);
        const rawData = response.data;

        let sessions = extractSessionsArray(rawData);
        if (sessions.length === 0) {
            return res.json(createDefaultPrediction());
        }

        const validSessions = sessions.filter(s => {
            const result = getValue(s, ['result', 'ketqua', 'ket_qua', 'status', 'outcome'], '').toUpperCase();
            return result === 'T' || result === 'X';
        });

        if (validSessions.length === 0) {
            const lastSession = sessions[0] || {};
            const phien = getValue(lastSession, ['id', 'session_id', 'sessionId'], 0);
            const dice = getValue(lastSession, ['dice', 'dices', 'xuc_xac', 'numbers', 'value'], '0-0-0');
            return res.json({
                Id: 's2king',
                Phien: phien,
                ket_qua: 'Chưa có',
                Xuc_xac: Array.isArray(dice) ? dice.join('-') : String(dice),
                Phien_moi: phien + 1,
                Du_doan: 'Tài',
                Do_tin_cay: '50.00%'
            });
        }

        const system = new UltraDicePredictionSystem();
        const results = validSessions.map(s => getValue(s, ['result', 'ketqua', 'ket_qua', 'status', 'outcome'], '').toUpperCase());
        for (const r of results) {
            system.addResult(r);
        }

        let prediction = system.getFinalPrediction();
        if (!prediction) {
            const lastResult = results[results.length - 1];
            const fallbackPred = lastResult === 'T' ? 'X' : 'T';
            prediction = {
                prediction: fallbackPred,
                confidence: 0.55,
                reasons: ['Dự đoán dựa trên quy luật đảo chiều cơ bản']
            };
        }

        const lastSession = validSessions[validSessions.length - 1];
        const phien = getValue(lastSession, ['id', 'session_id', 'sessionId'], validSessions.length);
        const phienMoi = phien + 1;
        let dice = getValue(lastSession, ['dice', 'dices', 'xuc_xac', 'numbers', 'value'], [0, 0, 0]);
        if (Array.isArray(dice)) {
            dice = dice.join('-');
        } else if (typeof dice !== 'string') {
            dice = '0-0-0';
        }

        const ketQua = getValue(lastSession, ['result', 'ketqua', 'ket_qua', 'status', 'outcome'], '').toUpperCase() === 'T' ? 'Tài' : 'Xỉu';
        const duDoan = prediction.prediction === 'T' ? 'Tài' : 'Xỉu';
        const doTinCay = (prediction.confidence * 100).toFixed(2) + '%';

        res.json({
            Id: 's2king',
            Phien: phien,
            ket_qua: ketQua,
            Xuc_xac: dice,
            Phien_moi: phienMoi,
            Du_doan: duDoan,
            Do_tin_cay: doTinCay
        });
    } catch (error) {
        console.error('Lỗi /predict:', error.message);
        res.status(500).json({ error: 'Lỗi máy chủ nội bộ', detail: error.message });
    }
});

app.get('/status', (req, res) => {
    res.json({
        status: 'running',
        last_update: lastUpdateTime ? lastUpdateTime.toISOString() : null,
        has_prediction: !!latestPrediction,
        auto_update_interval: AUTO_UPDATE_INTERVAL / 1000 + 's'
    });
});

app.listen(port, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${port}`);
    console.log(`📡 Tự động cập nhật mỗi ${AUTO_UPDATE_INTERVAL/1000} giây`);
    console.log(`📌 Endpoint /latest để lấy dự đoán mới nhất`);
    console.log(`📌 Endpoint /predict để gọi API trực tiếp`);
    console.log(`📌 Endpoint /status để xem trạng thái`);
});