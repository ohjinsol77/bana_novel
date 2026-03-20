const MAX_LONG_TEXT_LENGTH = 1500;

const PERSONA_OPTIONS = {
    gender: [
        { label: '남성', value: 'male' },
        { label: '여성', value: 'female' },
        { label: '기타', value: 'other' },
    ],
    personality: [
        { label: '친절함', value: 'kind' },
        { label: '장난기 많음', value: 'playful' },
        { label: '호기심 많음', value: 'curious' },
        { label: '논리적', value: 'logical' },
        { label: '차분함', value: 'calm' },
        { label: '활발함', value: 'energetic' },
        { label: '낙천적', value: 'optimistic' },
        { label: '냉소적', value: 'sarcastic' },
        { label: '현실적', value: 'pragmatic' },
        { label: '감성적', value: 'emotional' },
        { label: '유머러스', value: 'humorous' },
        { label: '보호본능', value: 'protective' },
        { label: '츤데레', value: 'tsundere' },
        { label: '카리스마', value: 'charismatic' },
        { label: '엉뚱함', value: 'quirky' },
        { label: '신비로움', value: 'mysterious' },
        { label: '적극적', value: 'proactive' },
        { label: '내향적', value: 'introverted' },
        { label: '외향적', value: 'extroverted' },
        { label: '분석적', value: 'analytical' },
    ],
    speechStyles: [
        { label: '존댓말', value: 'formal' },
        { label: '반말', value: 'casual' },
        { label: '친근한 말투', value: 'friendly' },
        { label: '차분한 말투', value: 'calm_tone' },
        { label: '장난스러운 말투', value: 'playful_tone' },
        { label: '직설적인 말투', value: 'direct' },
        { label: '부드러운 말투', value: 'gentle' },
        { label: '설명형 말투', value: 'explanatory' },
        { label: '짧은 문장', value: 'short_sentences' },
        { label: '긴 설명', value: 'long_explanations' },
        { label: '이모지 사용', value: 'emoji' },
        { label: '질문 자주함', value: 'asks_questions' },
    ],
    behaviorRules: [
        { label: '항상 밝은 분위기로 대화한다', value: 'stay_positive' },
        { label: '상대에게 공감한다', value: 'show_empathy' },
        { label: '질문을 자주 한다', value: 'ask_questions' },
        { label: '대화를 자연스럽게 이어간다', value: 'keep_conversation' },
        { label: '유머를 가끔 사용한다', value: 'use_humor' },
        { label: '도움을 주려고 노력한다', value: 'be_helpful' },
    ],
    likes: [
        { label: '게임', value: 'games' },
        { label: '애니메이션', value: 'anime' },
        { label: '영화', value: 'movies' },
        { label: '음악', value: 'music' },
        { label: '운동', value: 'sports' },
        { label: '여행', value: 'travel' },
        { label: '음식', value: 'food' },
        { label: '책', value: 'books' },
        { label: 'IT', value: 'technology' },
        { label: '패션', value: 'fashion' },
        { label: '사진', value: 'photography' },
        { label: '동물', value: 'animals' },
        { label: '카페', value: 'cafes' },
        { label: '밤 대화', value: 'late_night_chat' },
        { label: 'SNS', value: 'social_media' },
    ],
    dislikes: [
        { label: '무례한 사람', value: 'rude_people' },
        { label: '지루한 대화', value: 'boring_conversation' },
        { label: '거짓말', value: 'lies' },
        { label: '시끄러운 환경', value: 'loud_environment' },
        { label: '공격적인 말', value: 'aggressive_language' },
    ],
    relationship: [
        { label: '친구', value: 'friend' },
        { label: '연인', value: 'lover' },
        { label: '동료', value: 'colleague' },
        { label: '멘토', value: 'mentor' },
        { label: '상담가', value: 'advisor' },
        { label: '게임 친구', value: 'gaming_friend' },
        { label: '가이드', value: 'guide' },
    ],
    goals: [
        { label: '이야기 속 인물들과 친해지기', value: 'build_friendship' },
        { label: '재미있는 대화', value: 'fun_conversation' },
        { label: '도움 주기', value: 'provide_help' },
        { label: '정보 제공', value: 'provide_information' },
        { label: '감정 교류', value: 'emotional_support' },
    ],
};

const OPTION_LOOKUPS = Object.fromEntries(
    Object.entries(PERSONA_OPTIONS).map(([key, options]) => [key, new Map(options.map((option) => [option.value, option.label]))])
);

function toTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function toLimitedString(value, maxLength = MAX_LONG_TEXT_LENGTH) {
    return toTrimmedString(value).slice(0, maxLength);
}

function parseJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function parseAge(value) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.min(999, Math.floor(parsed)));
}

function sanitizeArray(values, allowedMap, limit) {
    if (!Array.isArray(values)) return [];

    const result = [];
    const seen = new Set();

    for (const value of values) {
        const item = toTrimmedString(value);
        if (!item || !allowedMap.has(item) || seen.has(item)) continue;

        seen.add(item);
        result.push(item);

        if (result.length >= limit) break;
    }

    return result;
}

function fallbackLegacyBackground(row) {
    const legacyParts = [
        row?.personality ? `이전 성격 메모: ${row.personality}` : '',
        row?.appearance ? `이전 외관 메모: ${row.appearance}` : '',
        row?.habits ? `이전 특징 메모: ${row.habits}` : '',
    ].filter(Boolean);

    return legacyParts.join('\n').slice(0, MAX_LONG_TEXT_LENGTH);
}

export function createEmptyPersona() {
    return {
        name: '',
        isProtagonist: false,
        age: null,
        gender: 'other',
        job: '',
        residence: '',
        personality: [],
        speechStyles: [],
        behaviorRules: [],
        customBehaviorRules: '',
        likes: [],
        dislikes: [],
        customDislikes: '',
        relationship: 'friend',
        goals: [],
        customGoals: '',
        background: '',
    };
}

export function normalizeCharacterPayload(character = {}) {
    const source = {
        ...createEmptyPersona(),
        ...(parseJson(character?.persona_json) || {}),
        ...character,
    };

    return {
        name: toLimitedString(source.name, 100),
        isProtagonist: Boolean(source.isProtagonist),
        age: parseAge(source.age),
        gender: OPTION_LOOKUPS.gender.has(source.gender) ? source.gender : 'other',
        job: toLimitedString(source.job, 100),
        residence: toLimitedString(source.residence, 100),
        personality: sanitizeArray(source.personality, OPTION_LOOKUPS.personality, 5),
        speechStyles: sanitizeArray(source.speechStyles, OPTION_LOOKUPS.speechStyles, 3),
        behaviorRules: sanitizeArray(source.behaviorRules, OPTION_LOOKUPS.behaviorRules, PERSONA_OPTIONS.behaviorRules.length),
        customBehaviorRules: toLimitedString(source.customBehaviorRules),
        likes: sanitizeArray(source.likes, OPTION_LOOKUPS.likes, 5),
        dislikes: sanitizeArray(source.dislikes, OPTION_LOOKUPS.dislikes, PERSONA_OPTIONS.dislikes.length),
        customDislikes: toLimitedString(source.customDislikes),
        relationship: OPTION_LOOKUPS.relationship.has(source.relationship) ? source.relationship : 'friend',
        goals: sanitizeArray(source.goals, OPTION_LOOKUPS.goals, PERSONA_OPTIONS.goals.length),
        customGoals: toLimitedString(source.customGoals),
        background: toLimitedString(source.background),
    };
}

export function hydrateCharacterRow(row) {
    const persona = row?.persona_json
        ? normalizeCharacterPayload({
            ...(parseJson(row.persona_json) || {}),
            name: row?.name || '',
        })
        : normalizeCharacterPayload({
            name: row?.name || '',
            background: fallbackLegacyBackground(row),
        });

    return {
        ...persona,
        name: persona.name || toLimitedString(row?.name, 100),
        id: row?.id,
        story_id: row?.story_id,
    };
}

export function serializeCharacterPayload(character) {
    const persona = normalizeCharacterPayload(character);

    return {
        name: persona.name,
        personaJson: JSON.stringify(persona),
        persona,
    };
}

function toDisplayText(values, lookupKey) {
    const labels = values
        .map((value) => OPTION_LOOKUPS[lookupKey].get(value))
        .filter(Boolean);

    return labels.length ? labels.join(', ') : '미설정';
}

export function formatCharacterPersona(character) {
    const ageText = character.age === null ? '미설정' : `${character.age}세`;
    const customBehaviorText = character.customBehaviorRules || '없음';
    const customDislikesText = character.customDislikes || '없음';
    const customGoalsText = character.customGoals || '없음';

    return [
        `[인물: ${character.name || '이름 미설정'}]`,
        `- 기본 정보: 나이 ${ageText}, 성별 ${OPTION_LOOKUPS.gender.get(character.gender) || '기타'}, 직업 ${character.job || '미설정'}, 거주지 ${character.residence || '미설정'}`,
        `- 주인공 여부: ${character.isProtagonist ? '주인공' : '조연/기타'}`,
        `- 성격: ${toDisplayText(character.personality, 'personality')}`,
        `- 말투: ${toDisplayText(character.speechStyles, 'speechStyles')}`,
        `- 행동 성향: ${toDisplayText(character.behaviorRules, 'behaviorRules')}`,
        `- 추가 메모: ${customBehaviorText}`,
        `- 선호: ${toDisplayText(character.likes, 'likes')}`,
        `- 비선호: ${toDisplayText(character.dislikes, 'dislikes')}`,
        `- 비선호 추가 메모: ${customDislikesText}`,
        `- 이야기 속 역할: ${OPTION_LOOKUPS.relationship.get(character.relationship) || '친구'}`,
        `- 장면 목표: ${toDisplayText(character.goals, 'goals')}`,
        `- 장면 목표 추가 메모: ${customGoalsText}`,
        `- 캐릭터 개요: ${character.background || '미설정'}`,
    ].join('\n');
}
