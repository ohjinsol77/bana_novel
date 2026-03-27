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

export async function requestPhoneVerification(data: { phoneNumber: string; purpose: 'signup' | 'identity' | 'adult' | 'topup'; createdForUserId?: number }) {
    const res = await fetch(`${BASE}/auth/phone/request`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `인증번호 전송에 실패했습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
    }
    return res.json();
}

export async function verifyPhoneCode(data: { verificationId: number; code: string }) {
    const res = await fetch(`${BASE}/auth/phone/verify`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `인증번호 확인에 실패했습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
    }
    return res.json();
}

export async function registerLocalUser(data: { name: string; email: string; password: string; birthDate?: string; phoneVerificationToken: string }) {
    const res = await fetch(`${BASE}/auth/register`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `회원가입에 실패했습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
    }
    return res.json();
}

export async function loginLocalUser(data: { email: string; password: string }) {
    const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `로그인에 실패했습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
    }
    return res.json();
}

export async function completePhoneVerification(data: { verificationToken: string }) {
    const res = await fetch(`${BASE}/auth/me/phone`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `본인인증에 실패했습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
    }
    return res.json();
}

export async function completeAdultVerification(data: { verificationToken: string; birthDate: string }) {
    const res = await fetch(`${BASE}/auth/me/adult`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `성인인증에 실패했습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
    }
    return res.json();
}

export async function fetchMyPoints() {
    const res = await fetch(`${BASE}/points/me`, { headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `포인트 정보를 가져올 수 없습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
    }
    return res.json();
}

export async function topUpPoints(data: { amount: number; packageName?: string }) {
    const res = await fetch(`${BASE}/points/topup`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `포인트 충전에 실패했습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
    }
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

export async function updateStoryMessage(storyId: number, messageId: number, content: string) {
    const res = await fetch(`${BASE}/chat/${storyId}/messages/${messageId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ content }),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `메시지를 수정할 수 없습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
    }
    return res.json();
}

export async function sendStoryMessage(storyId: number, content: string) {
    const res = await fetch(`${BASE}/chat/${storyId}`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ content })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `집필 전송 실패 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
    }
    return res.json();
}

export async function prepareStoryBinding(storyId: number, options?: { includeCover?: boolean; includeUserText?: boolean; includeAuthorNote?: boolean; authorNoteText?: string }) {
    const res = await fetch(`${BASE}/stories/${storyId}/binding/prepare`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ options: options || {} }),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `제본용 페이지를 준비할 수 없습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        (error as Error & { code?: string }).code = errData.code;
        (error as Error & { requiredPoints?: number }).requiredPoints = errData.requiredPoints;
        (error as Error & { pointBalance?: number }).pointBalance = errData.pointBalance;
        throw error;
    }
    return res.json();
}

export async function finalizeStoryBinding(storyId: number, options?: { includeCover?: boolean; includeUserText?: boolean; includeAuthorNote?: boolean; authorNoteText?: string }) {
    const res = await fetch(`${BASE}/stories/${storyId}/binding/complete`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ options: options || {} }),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `제본 포인트를 차감할 수 없습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        (error as Error & { code?: string }).code = errData.code;
        (error as Error & { requiredPoints?: number }).requiredPoints = errData.requiredPoints;
        (error as Error & { pointBalance?: number }).pointBalance = errData.pointBalance;
        throw error;
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

export async function fetchAdminPointDashboard() {
    const res = await fetch(`${BASE}/admin/points/dashboard`, { headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `포인트 대시보드를 불러올 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export async function fetchAdminPointUser(id: number) {
    const res = await fetch(`${BASE}/admin/users/${id}/detail`, { headers: authHeaders() });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `회원 포인트 정보를 불러올 수 없습니다 (${res.status})`);
    }
    return res.json();
}

export async function adjustAdminUserPoints(id: number, data: { amount: number; note: string }) {
    const res = await fetch(`${BASE}/admin/users/${id}/points`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const error = new Error(errData.error || `포인트를 조정할 수 없습니다 (${res.status})`);
        (error as Error & { status?: number }).status = res.status;
        throw error;
    }
    return res.json();
}

export const oauthUrl = {
    apple: `${BASE}/auth/apple`,
    kakao: `${BASE}/auth/kakao`,
    google: `${BASE}/auth/google`,
    naver: `${BASE}/auth/naver`,
};
