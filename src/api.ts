const BASE = 'http://localhost:4000/api';

function getToken() {
    const t = localStorage.getItem('token');
    if (!t || t === 'null' || t === 'undefined') return '';
    return t;
}

function authHeaders() {
    return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

export async function fetchMe() {
    const res = await fetch(`${BASE}/auth/me`, { headers: authHeaders() });
    if (!res.ok) return null;
    return res.json();
}

// ── Characters ──────────────────────────────────────────────
export async function fetchCharacters() {
    const res = await fetch(`${BASE}/characters`, { headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `캐릭터 목록을 가져올 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export async function createCharacter(data: object) {
    const res = await fetch(`${BASE}/characters`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(data)
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `서버 오류 (${res.status})`);
    }
    return res.json();
}

export async function updateCharacter(id: number, data: object) {
    const res = await fetch(`${BASE}/characters/${id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(data)
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `서버 오류 (${res.status})`);
    }
    return res.json();
}

export async function deleteCharacter(id: number) {
    await fetch(`${BASE}/characters/${id}`, { method: 'DELETE', headers: authHeaders() });
}

// ── Chat ────────────────────────────────────────────────────
export async function fetchChatHistory(characterId: number) {
    const res = await fetch(`${BASE}/chat/${characterId}`, { headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `대화 내역을 가져올 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export async function sendMessage(characterId: number, content: string) {
    const res = await fetch(`${BASE}/chat/${characterId}`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ content })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `메시지 전송 실패 (${res.status})`);
    }
    return res.json();
}

export async function clearChat(characterId: number) {
    await fetch(`${BASE}/chat/${characterId}/clear`, { method: 'DELETE', headers: authHeaders() });
}

// ── Admin ───────────────────────────────────────────────────
export async function fetchAllUsers() {
    const res = await fetch(`${BASE}/auth/users`, { headers: authHeaders() });
    return res.ok ? res.json() : [];
}

export const oauthUrl = {
    kakao: `${BASE}/auth/kakao`,
    google: `${BASE}/auth/google`,
    naver: `${BASE}/auth/naver`,
};
