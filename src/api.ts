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

// ── Stories ─────────────────────────────────────────────────
export async function fetchStories() {
    const res = await fetch(`${BASE}/stories`, { headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `이야기 목록을 가져올 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export async function createStory(data: object) {
    const res = await fetch(`${BASE}/stories`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(data)
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `서버 오류 (${res.status})`);
    }
    return res.json();
}

export async function updateStory(id: number, data: object) {
    const res = await fetch(`${BASE}/stories/${id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(data)
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `서버 오류 (${res.status})`);
    }
    return res.json();
}

export async function deleteStory(id: number) {
    await fetch(`${BASE}/stories/${id}`, { method: 'DELETE', headers: authHeaders() });
}

export async function updateStorySettings(id: number, viewer_settings: any) {
    const payload = JSON.stringify({ viewer_settings });
    const headers = authHeaders();

    let res = await fetch(`${BASE}/stories/settings/${id}`, {
        method: 'PUT', headers, body: payload
    });

    // 구버전 백엔드 경로 호환
    if (res.status === 404) {
        res = await fetch(`${BASE}/stories/${id}/settings`, {
            method: 'PUT', headers, body: payload
        });
    }

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `서버 오류 (${res.status})`);
    }
    return res.json();
}

// ── Story Messages (Writing) ───────────────────────────────────
export async function fetchStoryMessages(storyId: number) {
    const res = await fetch(`${BASE}/chat/${storyId}`, { headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `대화 내역을 가져올 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export async function sendStoryMessage(storyId: number, content: string) {
    const res = await fetch(`${BASE}/chat/${storyId}`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ content })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `집필 전송 실패 (${res.status})`);
    }
    return res.json();
}

export async function clearStoryMessages(storyId: number) {
    await fetch(`${BASE}/chat/${storyId}/clear`, { method: 'DELETE', headers: authHeaders() });
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
