import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, 'server', '.env') });

const PORT = Number(process.env.API_SMOKE_PORT || 4101);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const API_BASE_URL = `${BASE_URL}/api`;
const TEST_SUFFIX = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const TEST_EMAILS = [
    `api-smoke-user1-${TEST_SUFFIX}@example.com`,
    `api-smoke-user2-${TEST_SUFFIX}@example.com`,
];
const TEST_PHONES = [
    `010${String(TEST_SUFFIX).slice(-8).padStart(8, '1')}`,
    `010${String(Number(TEST_SUFFIX) + 11).slice(-8).padStart(8, '2')}`,
    `010${String(Number(TEST_SUFFIX) + 22).slice(-8).padStart(8, '3')}`,
];

const serverLogs = [];
let serverProcess = null;
let db = null;

function logStep(message) {
    process.stdout.write(`\n[api-smoke] ${message}\n`);
}

function assert(condition, message, details = null) {
    if (condition) return;
    const error = new Error(message);
    error.details = details;
    throw error;
}

function describePayload(payload) {
    if (payload === null || payload === undefined) return '';
    if (typeof payload === 'string') return payload;
    try {
        return JSON.stringify(payload, null, 2);
    } catch {
        return String(payload);
    }
}

async function request(pathname, {
    method = 'GET',
    token = null,
    body,
    expectedStatus,
    redirect = 'follow',
    headers = {},
} = {}) {
    const url = pathname.startsWith('http') ? pathname : `${API_BASE_URL}${pathname}`;
    const requestHeaders = { ...headers };

    if (token) {
        requestHeaders.Authorization = `Bearer ${token}`;
    }

    let requestBody;
    if (body !== undefined) {
        requestHeaders['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(body);
    }

    const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody,
        redirect,
    });
    const rawText = await response.text();

    let data = null;
    if (rawText) {
        try {
            data = JSON.parse(rawText);
        } catch {
            data = rawText;
        }
    }

    if (expectedStatus !== undefined && response.status !== expectedStatus) {
        throw new Error([
            `${method} ${pathname} expected ${expectedStatus} but received ${response.status}.`,
            describePayload(data),
        ].filter(Boolean).join('\n'));
    }

    return {
        status: response.status,
        data,
        headers: response.headers,
    };
}

async function waitForServer(timeoutMs = 20000) {
    const startedAt = Date.now();
    let lastError = null;

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(`${BASE_URL}/health`);
            if (response.ok) {
                return;
            }
            lastError = new Error(`health returned ${response.status}`);
        } catch (error) {
            lastError = error;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Server did not become ready: ${lastError?.message || 'unknown error'}`);
}

async function startServer() {
    serverProcess = spawn(process.execPath, ['server/index.js'], {
        cwd: projectRoot,
        env: {
            ...process.env,
            PORT: String(PORT),
            FRONTEND_URL: 'http://localhost:5174',
            GEMINI_API_KEY: 'your_gemini_api_key_here',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });

    serverProcess.stdout.on('data', (chunk) => {
        serverLogs.push(String(chunk));
    });
    serverProcess.stderr.on('data', (chunk) => {
        serverLogs.push(String(chunk));
    });

    serverProcess.on('exit', (code, signal) => {
        serverLogs.push(`\n[server-exit] code=${code} signal=${signal}\n`);
    });

    await waitForServer();
}

async function stopServer() {
    if (!serverProcess || serverProcess.exitCode !== null) return;

    serverProcess.kill();
    await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5000);
        serverProcess.once('exit', () => {
            clearTimeout(timeout);
            resolve();
        });
    });
}

async function connectDb() {
    db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        charset: 'utf8mb4',
    });
}

async function cleanup() {
    if (db) {
        if (TEST_PHONES.length) {
            const phonePlaceholders = TEST_PHONES.map(() => '?').join(', ');
            await db.query(`DELETE FROM phone_verifications WHERE phone_number IN (${phonePlaceholders})`, TEST_PHONES);
        }

        if (TEST_EMAILS.length) {
            const emailPlaceholders = TEST_EMAILS.map(() => '?').join(', ');
            const [rows] = await db.query(`SELECT id FROM users WHERE email IN (${emailPlaceholders})`, TEST_EMAILS);
            const userIds = rows.map((row) => row.id);
            if (userIds.length) {
                const userPlaceholders = userIds.map(() => '?').join(', ');
                await db.query(`DELETE FROM users WHERE id IN (${userPlaceholders})`, userIds);
            }
        }

        await db.end();
        db = null;
    }
}

async function getAdminToken() {
    const response = await fetch(`${API_BASE_URL}/auth/apple`, { redirect: 'manual' });
    assert(response.status === 302, '관리자 토큰 발급 redirect가 필요합니다.', { status: response.status });

    const location = response.headers.get('location');
    assert(location, '관리자 redirect location이 없습니다.');

    const redirectUrl = new URL(location);
    const token = redirectUrl.searchParams.get('token');
    assert(token, '관리자 토큰이 redirect URL에 없습니다.', { location });
    return token;
}

function createCharacter(name, overrides = {}) {
    return {
        name,
        isProtagonist: false,
        age: 19,
        gender: 'other',
        job: '',
        residence: '',
        personality: ['kind'],
        speechStyles: ['friendly'],
        behaviorRules: ['keep_conversation'],
        customBehaviorRules: '',
        likes: ['books'],
        customLikes: '',
        dislikes: ['lies'],
        customDislikes: '',
        relationship: 'friend',
        goals: [],
        customGoals: '',
        background: '',
        ...overrides,
    };
}

async function main() {
    logStep('Starting isolated API smoke server');
    await connectDb();
    await cleanup();
    await startServer();

    const user1Name = 'API Smoke User 1';
    const user2Name = 'API Smoke User 2';
    const userPassword = 'Password123!';

    logStep('Running auth scenarios');
    await request('/auth/register', {
        method: 'POST',
        body: { name: 'Bad Email', email: 'bad-email', password: userPassword },
        expectedStatus: 400,
    });
    await request('/auth/register', {
        method: 'POST',
        body: { name: 'Short Password', email: `short-${TEST_SUFFIX}@example.com`, password: '1234' },
        expectedStatus: 400,
    });

    const registerUser1 = await request('/auth/register', {
        method: 'POST',
        body: { name: user1Name, email: TEST_EMAILS[0], password: userPassword },
        expectedStatus: 200,
    });
    const user1Token = registerUser1.data.token;
    const user1Id = registerUser1.data.user.id;
    assert(registerUser1.data.user.point_balance === 50, '웰컴 포인트 50이 지급되어야 합니다.', registerUser1.data);

    const registerUser2 = await request('/auth/register', {
        method: 'POST',
        body: { name: user2Name, email: TEST_EMAILS[1], password: userPassword },
        expectedStatus: 200,
    });
    const user2Token = registerUser2.data.token;
    const user2Id = registerUser2.data.user.id;

    await request('/auth/register', {
        method: 'POST',
        body: { name: user1Name, email: TEST_EMAILS[0], password: userPassword },
        expectedStatus: 409,
    });

    await request('/auth/login', {
        method: 'POST',
        body: { email: TEST_EMAILS[0], password: 'WrongPassword123!' },
        expectedStatus: 401,
    });
    const loginUser1 = await request('/auth/login', {
        method: 'POST',
        body: { email: TEST_EMAILS[0], password: userPassword },
        expectedStatus: 200,
    });
    assert(loginUser1.data.user.id === user1Id, '로그인한 유저가 회원가입 유저와 일치해야 합니다.');

    const meUser1 = await request('/auth/me', {
        method: 'GET',
        token: user1Token,
        expectedStatus: 200,
    });
    assert(meUser1.data.email === TEST_EMAILS[0], '내 정보 이메일이 일치해야 합니다.');

    await request('/auth/link/start', {
        method: 'POST',
        body: { provider: 'kakao' },
        expectedStatus: 401,
    });
    await request('/auth/link/start', {
        method: 'POST',
        token: user1Token,
        body: { provider: 'invalid' },
        expectedStatus: 400,
    });
    const oauthLink = await request('/auth/link/start', {
        method: 'POST',
        token: user1Token,
        body: { provider: 'kakao' },
        expectedStatus: 200,
    });
    assert(String(oauthLink.data.url || '').includes('/auth/kakao?state='), 'SNS 연결 시작 URL이 생성되어야 합니다.', oauthLink.data);

    logStep('Running phone and PASS verification scenarios');
    const legacyPhoneRequest = await request('/auth/phone/request', {
        method: 'POST',
        body: { phoneNumber: TEST_PHONES[2], purpose: 'signup' },
        expectedStatus: 200,
    });
    assert(legacyPhoneRequest.data.debugCode, '개발 환경에서는 SMS debugCode가 필요합니다.');

    await request('/auth/phone/verify', {
        method: 'POST',
        body: { verificationId: legacyPhoneRequest.data.verificationId, code: '000000' },
        expectedStatus: 400,
    });
    await request('/auth/phone/verify', {
        method: 'POST',
        body: { verificationId: legacyPhoneRequest.data.verificationId, code: legacyPhoneRequest.data.debugCode },
        expectedStatus: 200,
    });

    await request('/points/topup', {
        method: 'POST',
        token: user1Token,
        body: { amount: 50, packageName: 'before-pass' },
        expectedStatus: 403,
    });

    await request('/auth/pass/request', {
        method: 'POST',
        body: { phoneNumber: TEST_PHONES[0], purpose: 'invalid' },
        expectedStatus: 400,
    });
    const passRequest = await request('/auth/pass/request', {
        method: 'POST',
        body: { phoneNumber: TEST_PHONES[0], purpose: 'topup', createdForUserId: user1Id },
        expectedStatus: 200,
    });
    assert(passRequest.data.debugCode, '개발 환경에서는 PASS debugCode가 필요합니다.');

    await request('/auth/pass/verify', {
        method: 'POST',
        body: { verificationId: passRequest.data.verificationId, code: '111111' },
        expectedStatus: 400,
    });
    const passVerify = await request('/auth/pass/verify', {
        method: 'POST',
        body: { verificationId: passRequest.data.verificationId, code: passRequest.data.debugCode },
        expectedStatus: 200,
    });

    const completePass = await request('/auth/me/pass', {
        method: 'POST',
        token: user1Token,
        body: { verificationToken: passVerify.data.verificationToken },
        expectedStatus: 200,
    });
    assert(completePass.data.user.pass_verified_at, 'PASS 인증 후 pass_verified_at이 설정되어야 합니다.');

    const pointsBeforeTopup = await request('/points/me', {
        method: 'GET',
        token: user1Token,
        expectedStatus: 200,
    });
    const currentPointSettings = pointsBeforeTopup.data.pointSettings;

    const topupSuccess = await request('/points/topup', {
        method: 'POST',
        token: user1Token,
        body: { amount: 100, packageName: 'api smoke topup' },
        expectedStatus: 200,
    });
    assert(topupSuccess.data.pointBalance >= 150, '충전 후 포인트가 증가해야 합니다.', topupSuccess.data);

    logStep('Running story scenarios');
    await request('/stories', {
        method: 'POST',
        token: user1Token,
        body: { title: '', background: 'x', environment: 'y', characters: [] },
        expectedStatus: 400,
    });

    await request('/stories', {
        method: 'POST',
        token: user1Token,
        body: {
            title: 'Too Many Characters',
            background: 'test',
            environment: 'test',
            characters: Array.from({ length: 8 }, (_, index) => createCharacter(`캐릭터${index + 1}`)),
        },
        expectedStatus: 400,
    });

    const story1Create = await request('/stories', {
        method: 'POST',
        token: user1Token,
        body: {
            title: `API Smoke Story ${TEST_SUFFIX}`,
            background: '테스트 배경',
            environment: '비 오는 도시',
            cover_image_url: 'https://example.com/cover.jpg',
            characters: [
                createCharacter('민우', { isProtagonist: true, relationship: 'friend', personality: ['kind', 'calm'] }),
                createCharacter('레이나', { speechStyles: ['formal'], likes: ['music'] }),
            ],
        },
        expectedStatus: 200,
    });
    const story1Id = story1Create.data.id;

    const storyList = await request('/stories', {
        method: 'GET',
        token: user1Token,
        expectedStatus: 200,
    });
    assert(Array.isArray(storyList.data) && storyList.data.some((story) => story.id === story1Id), '생성한 이야기가 목록에 있어야 합니다.');

    const story1Detail = await request(`/stories/${story1Id}`, {
        method: 'GET',
        token: user1Token,
        expectedStatus: 200,
    });
    assert(story1Detail.data.title.includes('API Smoke Story'), '이야기 상세 제목이 맞아야 합니다.');

    await request(`/stories/settings/${story1Id}`, {
        method: 'PUT',
        token: user1Token,
        body: {
            viewer_settings: {
                fontSize: 18,
                lineHeight: 1.8,
            },
        },
        expectedStatus: 200,
    });

    const story1Update = await request(`/stories/${story1Id}`, {
        method: 'PUT',
        token: user1Token,
        body: {
            title: `API Smoke Story Updated ${TEST_SUFFIX}`,
            background: '수정된 배경',
            environment: '수정된 환경',
            cover_image_url: 'https://example.com/cover-updated.jpg',
            is_public: false,
            public_method: 'private',
            characters: [
                createCharacter('민우', { isProtagonist: true, relationship: 'friend', personality: ['kind', 'calm', 'protective'] }),
            ],
        },
        expectedStatus: 200,
    });
    assert(story1Update.data.title.includes('Updated'), '이야기 수정이 반영되어야 합니다.');

    logStep('Running chat and binding scenarios');
    const emptyChatHistory = await request(`/chat/${story1Id}`, {
        method: 'GET',
        token: user1Token,
        expectedStatus: 200,
    });
    assert(Array.isArray(emptyChatHistory.data) && emptyChatHistory.data.length === 0, '초기 채팅 기록은 비어 있어야 합니다.');

    await request(`/chat/${story1Id}`, {
        method: 'POST',
        token: user1Token,
        body: { content: '' },
        expectedStatus: 400,
    });

    const chatWrite = await request(`/chat/${story1Id}`, {
        method: 'POST',
        token: user1Token,
        body: { content: '첫 장면을 열어줘.' },
        expectedStatus: 200,
    });
    assert(chatWrite.data.role === 'assistant', '채팅 응답 role은 assistant여야 합니다.');
    assert(String(chatWrite.data.content || '').includes('AI 작가 모의 응답'), '테스트 환경에서는 모의 응답을 사용해야 합니다.', chatWrite.data);

    const chatHistory = await request(`/chat/${story1Id}`, {
        method: 'GET',
        token: user1Token,
        expectedStatus: 200,
    });
    assert(chatHistory.data.length === 2, '채팅 후 user/assistant 메시지 2개가 있어야 합니다.', chatHistory.data);

    const userMessage = chatHistory.data.find((message) => message.role === 'user');
    const assistantMessage = chatHistory.data.find((message) => message.role === 'assistant');
    assert(userMessage && assistantMessage, 'user/assistant 메시지가 모두 저장되어야 합니다.', chatHistory.data);

    await request(`/chat/${story1Id}/messages/${userMessage.id}`, {
        method: 'PUT',
        token: user1Token,
        body: { content: '사용자 메시지 수정 시도' },
        expectedStatus: 403,
    });
    await request(`/chat/${story1Id}/messages/${assistantMessage.id}`, {
        method: 'PUT',
        token: user1Token,
        body: { content: '' },
        expectedStatus: 400,
    });

    const assistantUpdate = await request(`/chat/${story1Id}/messages/${assistantMessage.id}`, {
        method: 'PUT',
        token: user1Token,
        body: { content: '수정된 AI 문장입니다.' },
        expectedStatus: 200,
    });
    assert(assistantUpdate.data.content === '수정된 AI 문장입니다.', 'AI 메시지 수정이 저장되어야 합니다.');

    const bindingPrepare = await request(`/stories/${story1Id}/binding/prepare`, {
        method: 'POST',
        token: user1Token,
        body: { options: {} },
        expectedStatus: 200,
    });
    assert(bindingPrepare.data.binding.pageCount > 0, '제본 준비 결과에 페이지가 있어야 합니다.', bindingPrepare.data);

    const bindingComplete = await request(`/stories/${story1Id}/binding/complete`, {
        method: 'POST',
        token: user1Token,
        body: { options: {} },
        expectedStatus: 200,
    });
    assert(bindingComplete.data.pageCount > 0, '제본 완료 결과에도 페이지 수가 있어야 합니다.');

    await request(`/chat/${story1Id}/clear`, {
        method: 'DELETE',
        token: user1Token,
        expectedStatus: 200,
    });
    const clearedChatHistory = await request(`/chat/${story1Id}`, {
        method: 'GET',
        token: user1Token,
        expectedStatus: 200,
    });
    assert(clearedChatHistory.data.length === 0, '채팅 초기화 후 기록이 비어야 합니다.');

    await request(`/stories/${story1Id}/binding/prepare`, {
        method: 'POST',
        token: user1Token,
        body: { options: {} },
        expectedStatus: 400,
    });

    logStep('Running public/community and admin scenarios');
    const story2Create = await request('/stories', {
        method: 'POST',
        token: user2Token,
        body: {
            title: `API Smoke Public Story ${TEST_SUFFIX}`,
            background: '공개 테스트 배경',
            environment: '커뮤니티용 환경',
            characters: [createCharacter('서브 주인공', { isProtagonist: true })],
        },
        expectedStatus: 200,
    });
    const story2Id = story2Create.data.id;

    const story2Pending = await request(`/stories/${story2Id}`, {
        method: 'PUT',
        token: user2Token,
        body: {
            title: story2Create.data.title,
            background: story2Create.data.background,
            environment: story2Create.data.environment,
            cover_image_url: null,
            is_public: true,
            characters: [createCharacter('서브 주인공', { isProtagonist: true })],
        },
        expectedStatus: 200,
    });
    assert(story2Pending.data.public_status === 'pending', '일반 사용자의 공개 요청은 pending이어야 합니다.', story2Pending.data);

    const adminToken = await getAdminToken();

    await request('/auth/users', {
        method: 'GET',
        token: adminToken,
        expectedStatus: 200,
    });
    await request('/admin/dashboard', {
        method: 'GET',
        token: adminToken,
        expectedStatus: 200,
    });

    const adminStoryDetail = await request(`/admin/stories/${story2Id}`, {
        method: 'GET',
        token: adminToken,
        expectedStatus: 200,
    });
    assert(adminStoryDetail.data.story.publicStatus === 'pending', '관리자 상세에서도 pending 상태가 보여야 합니다.');

    await request(`/admin/stories/${story2Id}/review`, {
        method: 'PATCH',
        token: adminToken,
        body: { action: 'approve' },
        expectedStatus: 200,
    });

    await request(`/admin/stories/${story2Id}/visibility`, {
        method: 'PATCH',
        token: adminToken,
        body: { isPublic: false },
        expectedStatus: 200,
    });
    await request(`/admin/stories/${story2Id}/visibility`, {
        method: 'PATCH',
        token: adminToken,
        body: { isPublic: true },
        expectedStatus: 200,
    });

    await request('/admin/points/dashboard', {
        method: 'GET',
        token: adminToken,
        expectedStatus: 200,
    });
    await request('/points/admin/dashboard', {
        method: 'GET',
        token: adminToken,
        expectedStatus: 200,
    });
    await request('/admin/points/settings', {
        method: 'PUT',
        token: adminToken,
        body: { chatPointCost: -1, premiumChatPointCost: 10, bindingPointCostPerPage: 1 },
        expectedStatus: 400,
    });
    await request('/admin/points/settings', {
        method: 'PUT',
        token: adminToken,
        body: currentPointSettings,
        expectedStatus: 200,
    });

    await request(`/points/admin/users/${user1Id}`, {
        method: 'GET',
        token: adminToken,
        expectedStatus: 200,
    });
    await request(`/points/admin/users/${user1Id}/adjust`, {
        method: 'POST',
        token: adminToken,
        body: { amount: 25, note: '' },
        expectedStatus: 400,
    });
    await request(`/points/admin/users/${user1Id}/adjust`, {
        method: 'POST',
        token: adminToken,
        body: { amount: 25, note: 'API smoke adjust' },
        expectedStatus: 200,
    });
    await request(`/points/admin/users/${user1Id}/transactions`, {
        method: 'GET',
        token: adminToken,
        expectedStatus: 200,
    });

    await request(`/admin/users/${user1Id}/detail`, {
        method: 'GET',
        token: adminToken,
        expectedStatus: 200,
    });
    await request(`/admin/users/${user1Id}/points`, {
        method: 'POST',
        token: adminToken,
        body: { amount: -5, note: 'API smoke secondary adjust' },
        expectedStatus: 200,
    });
    await request(`/admin/users/${user1Id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { isPremium: true, isSuspended: false, canPublishCommunity: true },
        expectedStatus: 200,
    });

    const communityStories = await request('/stories/community', {
        method: 'GET',
        token: user1Token,
        expectedStatus: 200,
    });
    assert(communityStories.data.some((story) => story.id === story2Id), '커뮤니티 목록에 승인된 다른 사용자 이야기가 보여야 합니다.', communityStories.data);

    const publicFeed = await request('/stories/public/feed', {
        method: 'GET',
        expectedStatus: 200,
    });
    assert(publicFeed.data.some((story) => story.id === story2Id), '공개 피드에 승인된 이야기가 보여야 합니다.', publicFeed.data);

    await request(`/admin/stories/${story2Id}`, {
        method: 'DELETE',
        token: adminToken,
        expectedStatus: 200,
    });
    await request(`/stories/${story1Id}`, {
        method: 'DELETE',
        token: user1Token,
        expectedStatus: 200,
    });
}

try {
    await main();
    logStep('API smoke test passed');
} catch (error) {
    process.stderr.write(`\n[api-smoke] FAILED: ${error.message}\n`);
    if (error.details) {
        process.stderr.write(`${describePayload(error.details)}\n`);
    }
    const tailLogs = serverLogs.join('').split(/\r?\n/).slice(-80).join('\n');
    if (tailLogs.trim()) {
        process.stderr.write(`\n[api-smoke] server log tail\n${tailLogs}\n`);
    }
    process.exitCode = 1;
} finally {
    await cleanup().catch((cleanupError) => {
        process.stderr.write(`\n[api-smoke] cleanup failed: ${cleanupError.message}\n`);
        process.exitCode = 1;
    });
    await stopServer().catch((stopError) => {
        process.stderr.write(`\n[api-smoke] server stop failed: ${stopError.message}\n`);
        process.exitCode = 1;
    });
}
