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
    const res = await fetch(`${BASE}/stories/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `이야기를 삭제할 수 없습니다 (${res.status})`);
    }
}

export async function updateStorySettings(id: number, viewer_settings: unknown) {
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

export async function fetchCommunityStories() {
    const res = await fetch(`${BASE}/stories/community`, { headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `커뮤니티 목록을 가져올 수 없습니다 (${res.status})`);
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
    const res = await fetch(`${BASE}/chat/${storyId}/clear`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `집필 기록을 초기화할 수 없습니다 (${res.status})`);
    }
}

// ── Admin ───────────────────────────────────────────────────
export async function fetchAllUsers() {
    const res = await fetch(`${BASE}/auth/users`, { headers: authHeaders() });
    return res.ok ? res.json() : [];
}

export async function fetchAdminDashboard(params: Record<string, string | number | undefined> = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            query.set(key, String(value));
        }
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${BASE}/admin/dashboard${suffix}`, { headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `관리자 대시보드를 불러올 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export async function fetchAdminStoryDetail(id: number) {
    const res = await fetch(`${BASE}/admin/stories/${id}`, { headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `이야기 상세를 불러올 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export async function updateAdminStoryVisibility(id: number, isPublic: boolean) {
    const res = await fetch(`${BASE}/admin/stories/${id}/visibility`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ isPublic }),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `이야기 공개 상태를 바꿀 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export async function reviewAdminStory(id: number, data: { action: 'approve' | 'reject'; reason?: string }) {
    const res = await fetch(`${BASE}/admin/stories/${id}/review`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `이야기 승인 처리를 할 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export async function deleteAdminStory(id: number) {
    const res = await fetch(`${BASE}/admin/stories/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `이야기를 삭제할 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export async function updateAdminUser(id: number, data: Record<string, unknown>) {
    const res = await fetch(`${BASE}/admin/users/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `회원 상태를 변경할 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export const oauthUrl = {
    kakao: `${BASE}/auth/kakao`,
    google: `${BASE}/auth/google`,
    naver: `${BASE}/auth/naver`,
};
