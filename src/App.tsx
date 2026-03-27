import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Plus, Settings, Trash2, LogOut,
    ShieldAlert, CreditCard, ChevronLeft, Send, Sparkles,
    BookOpen, Globe, Lock, Users, RefreshCw,
    BarChart3, Database, MessageSquareText, ScrollText, Search,
    WalletCards, Coins, CircleDollarSign
} from 'lucide-react';
import {
    fetchMe, fetchStories, createStory, updateStory,
    deleteStory, fetchStoryMessages, sendStoryMessage, clearStoryMessages,
    fetchCommunityStories,
    fetchAdminDashboard, fetchAdminStoryDetail, updateAdminStoryVisibility, reviewAdminStory,
    deleteAdminStory, updateAdminUser, oauthUrl, updateStorySettings,
    fetchMyPoints, topUpPoints, fetchAdminPointDashboard, fetchAdminPointUser, adjustAdminUserPoints,
    updateStoryMessage,
    requestPhoneVerification, verifyPhoneCode, registerLocalUser, loginLocalUser,
    completePhoneVerification, completeAdultVerification,
    prepareStoryBinding, finalizeStoryBinding,
} from './api';
import { DEFAULT_BINDING_OPTIONS, buildBindingPages, estimateBindingPageCount, getBindingBodyBudget, normalizeBindingOptions } from '../shared/binding-layout.js';
import './index.css';

// ── Types ───────────────────────────────────────────────────
interface AuthUser {
    id: number;
    name: string;
    email: string;
    role: 'user' | 'admin';
    provider?: string;
    is_adult: boolean;
    is_premium: boolean;
    can_publish_community: boolean;
    phone_number?: string | null;
    phone_verified_at?: string | null;
    adult_verified_at?: string | null;
    birth_date?: string | null;
    point_balance: number;
}

type StoryPublicMethod = 'private' | 'request' | 'approved' | 'direct';

export interface StoryCharacter {
    id?: number;
    story_id?: number;
    name: string;
    isProtagonist: boolean;
    age: number | '';
    gender: string;
    job: string;
    residence: string;
    personality: string[];
    speechStyles: string[];
    behaviorRules: string[];
    customBehaviorRules: string;
    likes: string[];
    dislikes: string[];
    customDislikes: string;
    relationship: string;
    goals: string[];
    customGoals: string;
    background: string;
}

export interface Story {
    id: number;
    user_id: number;
    title: string;
    background: string;
    environment: string;
    is_public: boolean;
    public_status?: 'private' | 'pending' | 'approved' | 'rejected';
    public_method?: StoryPublicMethod;
    public_requested_at?: string | null;
    public_reviewed_at?: string | null;
    public_review_message?: string | null;
    cover_image_url?: string | null;
    created_at: string;
    updated_at: string;
    characters: StoryCharacter[]; // Joined from backend
    viewer_settings?: Partial<ReaderSettings> | null;
}

export interface StoryMessage {
    id: number;
    story_id: number;
    user_id?: number;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
}

type ViewName = 'login' | 'home' | 'community' | 'studio' | 'chat' | 'points' | 'profile' | 'admin' | 'binding';
type AdminTab = 'overview' | 'users' | 'stories' | 'messages' | 'requests' | 'public' | 'database' | 'points';
type AdminDatabaseView = 'stats' | 'graph' | 'distribution' | 'filters' | 'tables';
type AdminSeriesKey = 'users' | 'stories' | 'messages';
type PointTransactionType = 'welcome' | 'topup' | 'chat' | 'binding' | 'admin_grant' | 'admin_deduct' | 'refund' | 'adjustment';
type BindingPageKind = 'cover' | 'author_note' | 'body';

const APPLE_ADMIN_LOCAL_TOKEN = 'apple-admin-local';

interface AdminUserRow {
    id: number;
    name: string;
    email: string;
    role: string;
    provider: string;
    isAdult: number;
    isPremium: number;
    isSuspended: number;
    canPublishCommunity: number;
    phoneNumber?: string | null;
    phoneVerifiedAt?: string | null;
    adultVerifiedAt?: string | null;
    birthDate?: string | null;
    pointBalance: number;
    createdAt: string;
}

interface AdminStoryRow {
    id: number;
    title: string;
    background: string;
    environment: string;
    isPublic: number;
    publicStatus?: 'private' | 'pending' | 'approved' | 'rejected';
    publicMethod?: StoryPublicMethod;
    coverImageUrl?: string | null;
    publicRequestedAt?: string | null;
    publicReviewedAt?: string | null;
    publicReviewMessage?: string | null;
    createdAt: string;
    updatedAt: string;
    authorName: string | null;
    authorEmail: string | null;
    characterCount: number;
    messageCount: number;
}

interface PointTransactionRow {
    id: number;
    userId: number;
    userName?: string | null;
    userEmail?: string | null;
    userRole?: string | null;
    isPremium?: number;
    amount: number;
    balanceAfter: number;
    transactionType: PointTransactionType;
    note?: string | null;
    referenceType?: string | null;
    referenceId?: number | null;
    createdBy?: number | null;
    createdAt: string;
}

interface PointMeData {
    pointBalance: number;
    chatCost: number;
    storyLimit: number;
    storyCount: number;
    canCharge: boolean;
    identityVerified?: boolean;
    adultVerified?: boolean;
    recentTransactions: PointTransactionRow[];
}

interface AdminPointDashboard {
    summary: {
        userCount: number;
        premiumUserCount: number;
        activePointUserCount: number;
        totalBalance: number;
        totalInflow: number;
        totalOutflow: number;
        welcomeGranted: number;
        totalTopup: number;
        chatSpent: number;
        bindingSpent: number;
        adminGranted: number;
        adminDeducted: number;
        transactionCount: number;
        transactions24h: number;
        net24h: number;
    };
    ledger: PointTransactionRow[];
    topUsers: Array<{ id: number; name: string; email: string | null; role: string; isPremium: number; pointBalance: number; createdAt: string }>;
}

interface AdminPointUserDetail {
    user: {
        id: number;
        name: string;
        email: string;
        role: string;
        provider: string;
        isAdult: number;
        isPremium: number;
        isSuspended: number;
        canPublishCommunity: number;
        phoneNumber?: string | null;
        phoneVerifiedAt?: string | null;
        adultVerifiedAt?: string | null;
        birthDate?: string | null;
        pointBalance: number;
        createdAt: string;
    };
    storyCount: number;
    recentTransactions: PointTransactionRow[];
}

interface AdminMessageRow {
    id: number;
    storyId: number;
    storyTitle: string | null;
    userId: number;
    authorName: string | null;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
}

interface AdminDetailMessageRow {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    authorName: string | null;
}

interface AdminTableStat {
    tableName: string;
    estimatedRows: number;
    sizeMb: number | null;
}

interface AdminSeriesRow {
    bucket: string;
    userCount: number;
    storyCount: number;
    messageCount: number;
    totalCount: number;
}

interface AdminLabelStat {
    label: string;
    value: number;
}

interface AdminRangeSummary {
    userCount: number;
    storyCount: number;
    messageCount: number;
    storyOwnerCount: number;
    activeWriterCount: number;
    publicStoryCount: number;
    premiumUserCount: number;
    suspendedUserCount: number;
    totalCount: number;
    avgCountPerBucket: number;
    bucketCount: number;
}

interface BindingSession {
    storyId: number;
    title: string;
    background: string;
    environment: string;
    options: BindingOptions;
    viewerSettings: Partial<ReaderSettings>;
    messages: StoryMessage[];
    pageCount: number;
    cost: number;
    remainingPoints: number;
    coverImageUrl?: string | null;
    authorName?: string | null;
    createdAt?: string | null;
    pages: BindingPage[];
}

interface BindingPageBlock {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    chunkIndex?: number;
}

interface BindingPage {
    number: number;
    kind: BindingPageKind;
    blocks: BindingPageBlock[];
}

interface BindingOptions {
    includeCover: boolean;
    includeUserText: boolean;
    includeAuthorNote: boolean;
    authorNoteText?: string;
}

interface AdminSelectedRange {
    preset: '24h' | '7d' | '30d' | 'custom';
    start: string;
    end: string;
    granularity: 'hour' | 'day';
    label: string;
}

interface AdminDatabaseStats {
    selectedRange: AdminSelectedRange;
    rangeUsage: AdminSeriesRow[];
    rangeSummary: AdminRangeSummary;
    hourlyUsage: AdminSeriesRow[];
    dailyUsage: AdminSeriesRow[];
    providerCounts: AdminLabelStat[];
    roleCounts: AdminLabelStat[];
    messageRoleCounts: AdminLabelStat[];
    storyVisibilityCounts: AdminLabelStat[];
    averages: {
        avgMessagesPerStory: number;
        avgCharactersPerStory: number;
        publicStoryRate: number;
        premiumRate: number;
        suspendedRate: number;
        activeWriterRate: number;
    };
}

interface AdminSummary {
    userCount: number;
    adminCount: number;
    premiumCount: number;
    adultCount: number;
    suspendedCount: number;
    storyCount: number;
    publicStoryCount: number;
    publicRequestCount: number;
    characterCount: number;
    messageCount: number;
    storyOwnerCount: number;
    activeWriterCount: number;
    bindingSpent: number;
    users24h: number;
    stories24h: number;
    messages24h: number;
    databaseSizeMb: number | null;
}

interface AdminDashboard {
    summary: AdminSummary;
    users: AdminUserRow[];
    stories: AdminStoryRow[];
    publicStories: AdminStoryRow[];
    publicRequests: AdminStoryRow[];
    publicReviewHistory: AdminStoryRow[];
    messages: AdminMessageRow[];
    tableStats: AdminTableStat[];
    databaseStats: AdminDatabaseStats;
    database: { name: string | null; sizeMb: number | null };
}

interface CommunityStoryRow {
    id: number;
    title: string;
    background: string;
    environment: string;
    coverImageUrl?: string | null;
    publicStatus?: 'private' | 'pending' | 'approved' | 'rejected';
    publicMethod?: StoryPublicMethod;
    isPublic: number;
    createdAt: string;
    updatedAt: string;
    authorName: string | null;
    authorRole?: string | null;
}

interface AdminStoryDetail {
    story: AdminStoryRow & {
        background: string;
        environment: string;
        viewerSettings?: Partial<ReaderSettings> | null;
        authorRole: string | null;
    };
    characters: StoryCharacter[];
    messages: AdminDetailMessageRow[];
}

interface ReaderSettings {
    aspectRatio: 'full' | 'wide' | 'standard' | 'tall';
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    showBackground: boolean;
    hideUserText: boolean;
    userColorR: number;
    userColorG: number;
    userColorB: number;
    aiColorR: number;
    aiColorG: number;
    aiColorB: number;
}

const MAX_CHARACTERS = 7;
const LONG_TEXT_LIMIT = 1500;
const PERSONALITY_LIMIT = 5;
const SPEECH_STYLE_LIMIT = 3;
const LIKES_LIMIT = 5;
const COVER_IMAGE_WIDTH = 800;
const COVER_IMAGE_HEIGHT = 1200;
const COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const GENDER_OPTIONS = [
    { label: '남성', value: 'male' },
    { label: '여성', value: 'female' },
    { label: '기타', value: 'other' },
];

const PERSONALITY_OPTIONS = [
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
];

const SPEECH_STYLE_OPTIONS = [
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
];

const BEHAVIOR_RULE_OPTIONS = [
    { label: '항상 밝은 분위기로 대화한다', value: 'stay_positive' },
    { label: '상대에게 공감한다', value: 'show_empathy' },
    { label: '질문을 자주 한다', value: 'ask_questions' },
    { label: '대화를 자연스럽게 이어간다', value: 'keep_conversation' },
    { label: '유머를 가끔 사용한다', value: 'use_humor' },
    { label: '도움을 주려고 노력한다', value: 'be_helpful' },
];

const LIKE_OPTIONS = [
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
];

const DISLIKE_OPTIONS = [
    { label: '무례한 사람', value: 'rude_people' },
    { label: '지루한 대화', value: 'boring_conversation' },
    { label: '거짓말', value: 'lies' },
    { label: '시끄러운 환경', value: 'loud_environment' },
    { label: '공격적인 말', value: 'aggressive_language' },
];

const RELATIONSHIP_OPTIONS = [
    { label: '친구', value: 'friend' },
    { label: '연인', value: 'lover' },
    { label: '동료', value: 'colleague' },
    { label: '멘토', value: 'mentor' },
    { label: '상담가', value: 'advisor' },
    { label: '게임 친구', value: 'gaming_friend' },
    { label: '가이드', value: 'guide' },
];

const GOAL_OPTIONS = [
    { label: '이야기 속 인물들과 친해지기', value: 'build_friendship' },
    { label: '재미있는 대화', value: 'fun_conversation' },
    { label: '도움 주기', value: 'provide_help' },
    { label: '정보 제공', value: 'provide_information' },
    { label: '감정 교류', value: 'emotional_support' },
];

const DEFAULT_READER_SETTINGS: ReaderSettings = {
    aspectRatio: 'tall',
    fontFamily: 'Gowun Batang',
    fontSize: 18,
    lineHeight: 1.8,
    showBackground: false,
    hideUserText: false,
    userColorR: 156, userColorG: 163, userColorB: 175,
    aiColorR: 18, aiColorG: 18, aiColorB: 18,
};

const DEFAULT_BINDING_VIEWER_SETTINGS: Partial<ReaderSettings> = {
    fontFamily: 'Pretendard',
    fontSize: 10,
    lineHeight: 1.55,
};

function isCompactReaderViewport() {
    return window.innerWidth <= 900 || window.innerHeight <= window.innerWidth * 1.08;
}

function createEmptyCharacter(): StoryCharacter {
    return {
        name: '',
        isProtagonist: false,
        age: '',
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

function normalizeCharacterForClient(character: Partial<StoryCharacter> = {}): StoryCharacter {
    return {
        ...createEmptyCharacter(),
        ...character,
        age: character.age === null || character.age === undefined ? '' : character.age,
        personality: Array.isArray(character.personality) ? character.personality : [],
        speechStyles: Array.isArray(character.speechStyles) ? character.speechStyles : [],
        behaviorRules: Array.isArray(character.behaviorRules) ? character.behaviorRules : [],
        likes: Array.isArray(character.likes) ? character.likes : [],
        dislikes: Array.isArray(character.dislikes) ? character.dislikes : [],
        goals: Array.isArray(character.goals) ? character.goals : [],
    };
}

function normalizeStoryForClient(story: Story): Story {
    return {
        ...story,
        characters: Array.isArray(story.characters) ? story.characters.map(normalizeCharacterForClient) : [],
    };
}

function normalizePublicMethod(value?: string | null): StoryPublicMethod {
    if (value === 'request' || value === 'approved' || value === 'direct' || value === 'private') return value;
    return 'private';
}

function resolveStoryVisibilityInfo(story: { isPublic: number; publicStatus?: string | null; publicMethod?: string | null }) {
    const status = story.publicStatus || (story.isPublic ? 'approved' : 'private');
    const method = normalizePublicMethod(story.publicMethod);

    if (status === 'pending') {
        return { label: '승인 대기', badge: 'badge-gold' };
    }

    if (status === 'rejected') {
        return { label: '반려', badge: 'badge-red' };
    }

    if (status === 'approved') {
        return method === 'direct'
            ? { label: '즉시 공개', badge: 'badge-green' }
            : { label: '공개', badge: 'badge-green' };
    }

    return { label: '비공개', badge: 'badge-red' };
}

function canUseDirectPublish(user: AuthUser | null) {
    return Boolean(user && (user.role === 'admin' || user.can_publish_community));
}

function getStoryLimitForUser(user: AuthUser | null) {
    if (user?.role === 'admin' || user?.is_premium) {
        return 30;
    }
    return 3;
}

function getChatCostForUser(user: AuthUser | null) {
    return user?.is_premium ? 10 : 15;
}

function formatPointTransactionTypeLabel(type: PointTransactionType) {
    switch (type) {
        case 'welcome': return '웰컴';
        case 'topup': return '충전';
        case 'chat': return '대화 차감';
        case 'binding': return '제본 차감';
        case 'admin_grant': return '관리자 지급';
        case 'admin_deduct': return '관리자 회수';
        case 'refund': return '환불';
        default: return '조정';
    }
}

function formatPointAmount(value: number | null | undefined) {
    return `${new Intl.NumberFormat('ko-KR').format(Number(value || 0))}P`;
}

function formatKoreanDateTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? '-'
        : date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
}

function limitLongText(value: string) {
    return value.slice(0, LONG_TEXT_LIMIT);
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getErrorMessage(err: unknown) {
    return err instanceof Error ? err.message : String(err);
}

function normalizeView(value: string): ViewName {
    return value === 'login' || value === 'home' || value === 'community' || value === 'studio' || value === 'chat' || value === 'points' || value === 'profile' || value === 'admin' || value === 'binding'
        ? value
        : 'home';
}

function toLocalDatetimeInput(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function getPresetRange(preset: '24h' | '7d' | '30d') {
    const end = new Date();
    const start = new Date(end);

    if (preset === '24h') {
        start.setHours(start.getHours() - 24);
    } else if (preset === '7d') {
        start.setDate(start.getDate() - 7);
    } else {
        start.setDate(start.getDate() - 30);
    }

    return {
        start: toLocalDatetimeInput(start),
        end: toLocalDatetimeInput(end),
    };
}

function isWithinDateRange(
    value: string | null | undefined,
    startInput: string,
    endInput: string
) {
    if (!startInput && !endInput) return true;
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return true;

    const start = startInput ? new Date(startInput) : null;
    const end = endInput ? new Date(endInput) : null;
    if (start && Number.isNaN(start.getTime())) return true;
    if (end && Number.isNaN(end.getTime())) return true;

    if (start && parsed < start) return false;
    if (end && parsed > end) return false;
    return true;
}

function buildAdminRangeParams(
    preset: '24h' | '7d' | '30d' | 'custom',
    startInput: string,
    endInput: string
) {
    if (preset === '24h' || preset === '7d' || preset === '30d') {
        const presetRange = getPresetRange(preset);
        return {
            preset,
            start: new Date(presetRange.start).toISOString(),
            end: new Date(presetRange.end).toISOString(),
        };
    }

    if (!startInput || !endInput) {
        return null;
    }

    const start = new Date(startInput);
    const end = new Date(endInput);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
        return null;
    }

    return {
        preset,
        start: start.toISOString(),
        end: end.toISOString(),
    };
}

async function createCoverImageDataUrl(file: File) {
    if (file.size > COVER_IMAGE_MAX_BYTES) {
        throw new Error('표지 이미지는 5MB 이하로 올려주세요.');
    }

    const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('표지 이미지를 읽을 수 없습니다.'));
        reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('표지 이미지를 불러올 수 없습니다.'));
        img.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = COVER_IMAGE_WIDTH;
    canvas.height = COVER_IMAGE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('캔버스를 초기화할 수 없습니다.');
    }

    const scale = Math.max(COVER_IMAGE_WIDTH / image.width, COVER_IMAGE_HEIGHT / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX = (COVER_IMAGE_WIDTH - drawWidth) / 2;
    const drawY = (COVER_IMAGE_HEIGHT - drawHeight) / 2;

    ctx.fillStyle = '#f4eadb';
    ctx.fillRect(0, 0, COVER_IMAGE_WIDTH, COVER_IMAGE_HEIGHT);
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    return canvas.toDataURL('image/jpeg', 0.88);
}

// ── App ─────────────────────────────────────────────────────
export default function App() {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [view, setView] = useState<ViewName>('home');
    const [stories, setStories] = useState<Story[]>([]);
    const [activeStory, setActiveStory] = useState<Story | null>(null);
    const [storyMessages, setStoryMessages] = useState<StoryMessage[]>([]);
    const [msgInput, setMsgInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [communityStories, setCommunityStories] = useState<CommunityStoryRow[]>([]);
    const [communityLoading, setCommunityLoading] = useState(false);
    const [communityError, setCommunityError] = useState('');
    const [communityQuery, setCommunityQuery] = useState('');
    const [communitySort, setCommunitySort] = useState<'latest' | 'oldest' | 'title' | 'author'>('latest');
    const [adminDashboard, setAdminDashboard] = useState<AdminDashboard | null>(null);
    const [adminTab, setAdminTab] = useState<AdminTab>('overview');
    const [adminLoading, setAdminLoading] = useState(false);
    const [adminError, setAdminError] = useState('');
    const [adminQuery, setAdminQuery] = useState('');
    const [adminStoryDetail, setAdminStoryDetail] = useState<AdminStoryDetail | null>(null);
    const [adminStoryLoading, setAdminStoryLoading] = useState(false);
    const [adminMutation, setAdminMutation] = useState<string | null>(null);
    const [adminDatabaseLoading, setAdminDatabaseLoading] = useState(false);
    const [adminDatabaseError, setAdminDatabaseError] = useState('');
    const [adminDatabaseView, setAdminDatabaseView] = useState<AdminDatabaseView>('stats');
    const [adminStatsPreset, setAdminStatsPreset] = useState<'24h' | '7d' | '30d' | 'custom'>('24h');
    const [adminStatsStart, setAdminStatsStart] = useState(() => getPresetRange('24h').start);
    const [adminStatsEnd, setAdminStatsEnd] = useState(() => getPresetRange('24h').end);
    const [adminSeriesFilters, setAdminSeriesFilters] = useState<Record<AdminSeriesKey, boolean>>({
        users: true,
        stories: true,
        messages: true,
    });
    const [adminReviewNotes, setAdminReviewNotes] = useState<Record<number, string>>({});
    const [adminRequestPreset, setAdminRequestPreset] = useState<'all' | '7d' | '30d' | 'custom'>('all');
    const [adminRequestStart, setAdminRequestStart] = useState(() => getPresetRange('7d').start);
    const [adminRequestEnd, setAdminRequestEnd] = useState(() => getPresetRange('7d').end);
    const [pointData, setPointData] = useState<PointMeData | null>(null);
    const [pointLoading, setPointLoading] = useState(false);
    const [pointError, setPointError] = useState('');
    const [pointChargeAmount, setPointChargeAmount] = useState(100);
    const [pointChargePreset, setPointChargePreset] = useState<100 | 300 | 500 | 1000>(300);
    const [insufficientPointsOpen, setInsufficientPointsOpen] = useState(false);
    const [insufficientPointNeed, setInsufficientPointNeed] = useState(0);
    const [insufficientPointHave, setInsufficientPointHave] = useState(0);
    const [insufficientPointMessage, setInsufficientPointMessage] = useState('대화를 위한 포인트가 부족합니다 충전하시겠습니까?');
    const [bindingOptions, setBindingOptions] = useState<BindingOptions>({ ...DEFAULT_BINDING_OPTIONS });
    const [bindingQuoteOpen, setBindingQuoteOpen] = useState(false);
    const [bindingQuoteLoading, setBindingQuoteLoading] = useState(false);
    const [bindingPreview, setBindingPreview] = useState<BindingSession | null>(null);
    const [bindingOpenError, setBindingOpenError] = useState('');
    const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
    const [localLoginEmail, setLocalLoginEmail] = useState('');
    const [localLoginPassword, setLocalLoginPassword] = useState('');
    const [localLoginLoading, setLocalLoginLoading] = useState(false);
    const [localLoginError, setLocalLoginError] = useState('');
    const [signupName, setSignupName] = useState('');
    const [signupEmail, setSignupEmail] = useState('');
    const [signupPassword, setSignupPassword] = useState('');
    const [signupBirthDate, setSignupBirthDate] = useState('');
    const [signupPhoneNumber, setSignupPhoneNumber] = useState('');
    const [signupPhoneRequestId, setSignupPhoneRequestId] = useState<number | null>(null);
    const [signupPhoneCode, setSignupPhoneCode] = useState('');
    const [signupPhoneToken, setSignupPhoneToken] = useState('');
    const [signupPhoneSending, setSignupPhoneSending] = useState(false);
    const [signupPhoneVerifying, setSignupPhoneVerifying] = useState(false);
    const [signupLoading, setSignupLoading] = useState(false);
    const [signupError, setSignupError] = useState('');
    const [signupInfo, setSignupInfo] = useState('');
    const [profilePhoneNumber, setProfilePhoneNumber] = useState('');
    const [profilePhoneRequestId, setProfilePhoneRequestId] = useState<number | null>(null);
    const [profilePhoneCode, setProfilePhoneCode] = useState('');
    const [profilePhoneSending, setProfilePhoneSending] = useState(false);
    const [profilePhoneVerifying, setProfilePhoneVerifying] = useState(false);
    const [profileAdultBirthDate, setProfileAdultBirthDate] = useState('');
    const [profileAdultPhoneNumber, setProfileAdultPhoneNumber] = useState('');
    const [profileAdultRequestId, setProfileAdultRequestId] = useState<number | null>(null);
    const [profileAdultCode, setProfileAdultCode] = useState('');
    const [profileAdultSending, setProfileAdultSending] = useState(false);
    const [profileAdultVerifying, setProfileAdultVerifying] = useState(false);
    const [profileActionMessage, setProfileActionMessage] = useState('');
    const [adminPointDashboard, setAdminPointDashboard] = useState<AdminPointDashboard | null>(null);
    const [adminPointLoading, setAdminPointLoading] = useState(false);
    const [adminPointError, setAdminPointError] = useState('');
    const [adminPointUserDetail, setAdminPointUserDetail] = useState<AdminPointUserDetail | null>(null);
    const [adminPointUserView, setAdminPointUserView] = useState<'summary' | 'ledger'>('summary');
    const [adminPointLedgerPage, setAdminPointLedgerPage] = useState(0);
    const [adminPointUserLoading, setAdminPointUserLoading] = useState(false);
    const [adminPointAdjustment, setAdminPointAdjustment] = useState('');
    const [adminPointAdjustmentNote, setAdminPointAdjustmentNote] = useState('');
    const [editMode, setEditMode] = useState<'new' | 'edit'>('new');
    const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
    const [editingMessageDraft, setEditingMessageDraft] = useState('');
    const [editingMessageSaving, setEditingMessageSaving] = useState(false);
    const [editedMessageScrollTargetId, setEditedMessageScrollTargetId] = useState<number | null>(null);
    const chatBottomRef = useRef<HTMLDivElement>(null);
    const pointDataLoadedForUserRef = useRef<number | null>(null);
    const adminPointDashboardLoadedRef = useRef(false);
    const editingMessageTextareaRef = useRef<HTMLTextAreaElement>(null);
    const storyMessageRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const bindingPrintRef = useRef<HTMLDivElement>(null);
    const bindingPreviewHydratedRef = useRef(false);
    const bindingPrintChargeRef = useRef<{
        storyId: number;
        options: BindingOptions;
        cost: number;
    } | null>(null);
    const bindingPrintChargeRunningRef = useRef(false);

    // Reader Settings (Restored)
    const [readerSettings, setReaderSettings] = useState<ReaderSettings>({ ...DEFAULT_READER_SETTINGS });
    const [isCompactReader, setIsCompactReader] = useState(() => isCompactReaderViewport());
    const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
    const [sliderValue, setSliderValue] = useState(0);

    const bookRef = useRef<HTMLDivElement>(null);

    // Story form
    const [form, setForm] = useState<Partial<Story>>({
        title: '', background: '', environment: '', is_public: false, public_method: 'private',
        characters: []
    });

    const navigate = (newView: ViewName) => {
        if (newView !== view) {
            window.history.pushState({ view: newView }, '', `/${newView === 'home' ? '' : newView}`);
            setView(newView);
        }
    };

    const loadStories = useCallback(async () => {
        try {
            const data = await fetchStories();
            setStories(data.map(normalizeStoryForClient));
        } catch (err: unknown) {
            console.error('Load stories failed:', err);
        }
    }, []);

    // ── Bootstrap: read token from URL or localStorage ──────
    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            if (e.state && e.state.view) {
                setView(normalizeView(String(e.state.view)));
            } else {
                const path = window.location.pathname.replace('/', '') || 'home';
                setView(normalizeView(path));
            }
        };
        window.addEventListener('popstate', handlePopState);

        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        if (urlToken) {
            localStorage.setItem('token', urlToken);
            window.history.replaceState({ view: 'home' }, '', '/');
        } else if (!window.history.state?.view) {
            const initialPath = window.location.pathname.replace('/', '') || 'home';
            window.history.replaceState({ view: initialPath }, '', window.location.pathname);
        }

        fetchMe().then(me => {
            if (me) {
                setUser({ ...me, point_balance: Number(me.point_balance ?? 0) });
                setView('home');
                loadStories();
            } else {
                setUser(null);
                setStories([]);
                setPointData(null);
                setView('home');
            }
        });

        return () => window.removeEventListener('popstate', handlePopState);
    }, [loadStories]);

    useEffect(() => {
        const handleResize = () => {
            setIsCompactReader(isCompactReaderViewport());
        };

        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!bindingPreviewHydratedRef.current) return;
        if (bindingPreview) {
            sessionStorage.setItem('bindingPreview', JSON.stringify(bindingPreview));
        } else {
            sessionStorage.removeItem('bindingPreview');
        }
    }, [bindingPreview]);

    useEffect(() => {
        sessionStorage.removeItem('bindingPreview');
        bindingPreviewHydratedRef.current = true;
    }, []);

    const useVerticalReader = readerSettings.aspectRatio === 'tall' || isCompactReader;

    const isInitialChatLoad = useRef(false);

    useEffect(() => {
        // Auto-scroll when new messages arrive
        if (!bookRef.current) return;
        const container = bookRef.current;
        const behaviorOpt = isInitialChatLoad.current ? 'auto' : 'smooth';

        if (useVerticalReader) {
            chatBottomRef.current?.scrollIntoView({ behavior: behaviorOpt });
        } else {
            // For multi-column horizontal scroll
            setTimeout(() => {
                const maxScrollLeft = container.scrollWidth - container.clientWidth;
                container.scrollTo({ left: maxScrollLeft, behavior: behaviorOpt });
                setSliderValue(maxScrollLeft);
            }, 100);
        }

        if (isInitialChatLoad.current) {
            isInitialChatLoad.current = false;
        }
    }, [storyMessages, useVerticalReader, readerSettings.hideUserText]);

    // Save reader settings to DB debounced
    useEffect(() => {
        if (!activeStory || view !== 'chat') return;
        const timer = setTimeout(() => {
            updateStorySettings(activeStory.id, readerSettings).catch(e => console.error('Failed to save settings:', e));
        }, 1000);
        return () => clearTimeout(timer);
    }, [readerSettings, activeStory, view]);

    const loadCommunityStories = useCallback(async () => {
        try {
            setCommunityLoading(true);
            setCommunityError('');
            const data = await fetchCommunityStories();
            setCommunityStories(data);
        } catch (err: unknown) {
            console.error('Load community stories failed:', err);
            setCommunityError(getErrorMessage(err));
        } finally {
            setCommunityLoading(false);
        }
    }, []);

    const loadPointData = useCallback(async () => {
        if (!user) {
            setPointData(null);
            return null;
        }

        try {
            setPointLoading(true);
            setPointError('');
            const data = await fetchMyPoints();
            const normalized: PointMeData = {
                pointBalance: Number(data.pointBalance ?? data.point_balance ?? user.point_balance ?? 0),
                chatCost: Number(data.chatCost ?? data.chat_cost ?? getChatCostForUser(user)),
                storyLimit: Number(data.storyLimit ?? data.story_limit ?? getStoryLimitForUser(user)),
                storyCount: Number(data.storyCount ?? data.story_count ?? stories.length),
                canCharge: Boolean(data.canCharge ?? data.can_charge ?? true),
                identityVerified: Boolean(data.identityVerified ?? data.identity_verified ?? user.phone_verified_at),
                adultVerified: Boolean(data.adultVerified ?? data.adult_verified ?? user.is_adult),
                recentTransactions: Array.isArray(data.recentTransactions)
                    ? data.recentTransactions
                    : Array.isArray(data.recent_transactions)
                        ? data.recent_transactions
                        : [],
            };
            setPointData(normalized);
            setUser((current) => current ? { ...current, point_balance: normalized.pointBalance } : current);
            return normalized;
        } catch (err: unknown) {
            console.error('Load point data failed:', err);
            setPointError(getErrorMessage(err));
            throw err;
        } finally {
            setPointLoading(false);
        }
    }, [user, stories.length]);

    useEffect(() => {
        const handleAfterPrint = () => {
            const intent = bindingPrintChargeRef.current;
            if (!intent || bindingPrintChargeRunningRef.current) return;

            bindingPrintChargeRunningRef.current = true;
            void finalizeStoryBinding(intent.storyId, intent.options)
                .then((result) => {
                    const nextBalance = Number(result?.remainingPoints ?? 0);
                    setPointData((current) => current ? {
                        ...current,
                        pointBalance: nextBalance,
                    } : current);
                    setUser((current) => current ? {
                        ...current,
                        point_balance: nextBalance,
                    } : current);
                    setBindingPreview((current) => current && current.storyId === intent.storyId ? {
                        ...current,
                        remainingPoints: nextBalance,
                        cost: Number(result?.cost ?? current.cost),
                        pageCount: Number(result?.pageCount ?? current.pageCount),
                    } : current);
                    void loadPointData().catch(() => undefined);
                })
                .catch((err: unknown) => {
                    console.error('Finalize binding export failed:', err);
                    setBindingOpenError(getErrorMessage(err));
                })
                .finally(() => {
                    bindingPrintChargeRunningRef.current = false;
                    bindingPrintChargeRef.current = null;
                });
        };

        window.addEventListener('afterprint', handleAfterPrint);
        return () => window.removeEventListener('afterprint', handleAfterPrint);
    }, [loadPointData]);

    const applyAuthenticatedSession = useCallback(async (payload: { token: string; user?: AuthUser | Record<string, unknown> | null }) => {
        localStorage.setItem('token', payload.token);
        const nextUser = payload.user ? {
            ...(payload.user as AuthUser),
            point_balance: Number((payload.user as AuthUser).point_balance ?? 0),
        } : null;
        if (nextUser) {
            setUser(nextUser);
            pointDataLoadedForUserRef.current = null;
            setPointData(null);
            setStories([]);
            setActiveStory(null);
            setStoryMessages([]);
            setEditingMessageId(null);
            setEditingMessageDraft('');
            setEditingMessageSaving(false);
            setEditedMessageScrollTargetId(null);
            await loadStories();
        } else {
            const me = await fetchMe();
            if (!me) {
                throw new Error('로그인 정보를 불러오지 못했습니다.');
            }
            setUser({ ...me, point_balance: Number(me.point_balance ?? 0) });
            pointDataLoadedForUserRef.current = null;
            setPointData(null);
            await loadStories();
        }
        setView('home');
    }, [loadStories]);

    const loadAdminPointDashboard = useCallback(async () => {
        try {
            setAdminPointLoading(true);
            setAdminPointError('');
            const data = await fetchAdminPointDashboard();
            const normalized: AdminPointDashboard = {
                summary: {
                    userCount: Number(data.summary?.userCount ?? data.summary?.user_count ?? 0),
                    premiumUserCount: Number(data.summary?.premiumUserCount ?? data.summary?.premium_user_count ?? 0),
                    activePointUserCount: Number(data.summary?.activePointUserCount ?? data.summary?.active_point_user_count ?? 0),
                    totalBalance: Number(data.summary?.totalBalance ?? data.summary?.total_balance ?? 0),
                    totalInflow: Number(data.summary?.totalInflow ?? data.summary?.total_inflow ?? 0),
                    totalOutflow: Number(data.summary?.totalOutflow ?? data.summary?.total_outflow ?? 0),
                    welcomeGranted: Number(data.summary?.welcomeGranted ?? data.summary?.welcome_granted ?? 0),
                    totalTopup: Number(data.summary?.totalTopup ?? data.summary?.total_topup ?? 0),
                    chatSpent: Number(data.summary?.chatSpent ?? data.summary?.chat_spent ?? 0),
                    bindingSpent: Number(data.summary?.bindingSpent ?? data.summary?.binding_spent ?? 0),
                    adminGranted: Number(data.summary?.adminGranted ?? data.summary?.admin_granted ?? 0),
                    adminDeducted: Number(data.summary?.adminDeducted ?? data.summary?.admin_deducted ?? 0),
                    transactionCount: Number(data.summary?.transactionCount ?? data.summary?.transaction_count ?? 0),
                    transactions24h: Number(data.summary?.transactions24h ?? data.summary?.transactions_24h ?? 0),
                    net24h: Number(data.summary?.net24h ?? data.summary?.net_24h ?? 0),
                },
                ledger: Array.isArray(data.ledger) ? data.ledger : Array.isArray(data.transactions) ? data.transactions : [],
                topUsers: Array.isArray(data.topUsers) ? data.topUsers : Array.isArray(data.top_users) ? data.top_users : [],
            };
            setAdminPointDashboard(normalized);
            return normalized;
        } catch (err: unknown) {
            console.error('Load admin point dashboard failed:', err);
            setAdminPointError(getErrorMessage(err));
            throw err;
        } finally {
            setAdminPointLoading(false);
        }
    }, []);

    const openAdminPointUser = useCallback(async (userId: number) => {
        try {
            setAdminPointUserLoading(true);
            setAdminPointUserView('summary');
            setAdminPointLedgerPage(0);
            const detail = await fetchAdminPointUser(userId);
            setAdminPointUserDetail({
                user: {
                    id: Number(detail.user?.id ?? detail.member?.id ?? 0),
                    name: String(detail.user?.name ?? detail.member?.name ?? '회원'),
                    email: String(detail.user?.email ?? detail.member?.email ?? ''),
                    role: String(detail.user?.role ?? detail.member?.role ?? 'user'),
                    provider: String(detail.user?.provider ?? detail.member?.provider ?? 'local'),
                    isAdult: Number(detail.user?.isAdult ?? detail.user?.is_adult ?? detail.member?.isAdult ?? detail.member?.is_adult ?? 0),
                    isPremium: Number(detail.user?.isPremium ?? detail.user?.is_premium ?? detail.member?.isPremium ?? detail.member?.is_premium ?? 0),
                    isSuspended: Number(detail.user?.isSuspended ?? detail.user?.is_suspended ?? detail.member?.isSuspended ?? detail.member?.is_suspended ?? 0),
                    canPublishCommunity: Number(detail.user?.canPublishCommunity ?? detail.user?.can_publish_community ?? detail.member?.canPublishCommunity ?? detail.member?.can_publish_community ?? 0),
                    phoneNumber: String(detail.user?.phoneNumber ?? detail.user?.phone_number ?? detail.member?.phoneNumber ?? detail.member?.phone_number ?? ''),
                    phoneVerifiedAt: String(detail.user?.phoneVerifiedAt ?? detail.user?.phone_verified_at ?? detail.member?.phoneVerifiedAt ?? detail.member?.phone_verified_at ?? ''),
                    adultVerifiedAt: String(detail.user?.adultVerifiedAt ?? detail.user?.adult_verified_at ?? detail.member?.adultVerifiedAt ?? detail.member?.adult_verified_at ?? ''),
                    birthDate: String(detail.user?.birthDate ?? detail.user?.birth_date ?? detail.member?.birthDate ?? detail.member?.birth_date ?? ''),
                    pointBalance: Number(detail.user?.pointBalance ?? detail.user?.point_balance ?? detail.member?.pointBalance ?? detail.member?.point_balance ?? 0),
                    createdAt: String(detail.user?.createdAt ?? detail.user?.created_at ?? detail.member?.createdAt ?? detail.member?.created_at ?? ''),
                },
                storyCount: Number(detail.storyCount ?? detail.story_count ?? 0),
                recentTransactions: Array.isArray(detail.recentTransactions)
                    ? detail.recentTransactions
                    : Array.isArray(detail.recent_transactions)
                        ? detail.recent_transactions
                        : [],
            });
            setAdminPointAdjustment('0');
            setAdminPointAdjustmentNote('');
        } catch (err: unknown) {
            console.error('Open admin point user failed:', err);
            alert(`회원 포인트 정보를 불러올 수 없습니다: ${getErrorMessage(err)}`);
        } finally {
            setAdminPointUserLoading(false);
        }
    }, []);

    const closeAdminPointUserDetail = () => {
        setAdminPointUserDetail(null);
        setAdminPointUserView('summary');
        setAdminPointLedgerPage(0);
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        setStories([]);
        setActiveStory(null);
        setStoryMessages([]);
        setForm({
            title: '',
            background: '',
            environment: '',
            is_public: false,
            public_method: 'private',
            cover_image_url: '',
            characters: [],
        });
        setPointData(null);
        setAdminPointDashboard(null);
        setAdminPointUserDetail(null);
        setCommunityStories([]);
        setCommunityError('');
        setCommunityQuery('');
        pointDataLoadedForUserRef.current = null;
        adminPointDashboardLoadedRef.current = false;
        setEditingMessageId(null);
        setEditingMessageDraft('');
        setEditingMessageSaving(false);
        setEditedMessageScrollTargetId(null);
        setBindingPreview(null);
        setBindingOptions({ ...DEFAULT_BINDING_OPTIONS });
        setBindingQuoteOpen(false);
        setBindingQuoteLoading(false);
        setBindingOpenError('');
        setLocalLoginEmail('');
        setLocalLoginPassword('');
        setLocalLoginError('');
        setSignupName('');
        setSignupEmail('');
        setSignupPassword('');
        setSignupBirthDate('');
        setSignupPhoneNumber('');
        setSignupPhoneRequestId(null);
        setSignupPhoneCode('');
        setSignupPhoneToken('');
        setSignupPhoneSending(false);
        setSignupPhoneVerifying(false);
        setSignupLoading(false);
        setSignupError('');
        setSignupInfo('');
        setProfilePhoneNumber('');
        setProfilePhoneRequestId(null);
        setProfilePhoneCode('');
        setProfilePhoneSending(false);
        setProfilePhoneVerifying(false);
        setProfileAdultBirthDate('');
        setProfileAdultPhoneNumber('');
        setProfileAdultRequestId(null);
        setProfileAdultCode('');
        setProfileAdultSending(false);
        setProfileAdultVerifying(false);
        setProfileActionMessage('');
        navigate('home');
    };

    const openNewStory = () => {
        if (!user) {
            navigate('login');
            return;
        }
        const storyLimit = getStoryLimitForUser(user);
        if (stories.length >= storyLimit) {
            alert(`이야기는 최대 ${storyLimit}개까지 보유할 수 있습니다.`);
            return;
        }
        setActiveStory(null);
        setForm({ title: '', background: '', environment: '', is_public: false, public_method: 'private', cover_image_url: '', characters: [] });
        setEditMode('new');
        navigate('studio');
    };

    const openCommunity = async () => {
        if (!user) {
            navigate('login');
            return;
        }
        if (!communityStories.length && !communityLoading) {
            await loadCommunityStories();
        }
        navigate('community');
    };

    const openEditStory = (story: Story) => {
        const normalizedStory = normalizeStoryForClient(story);
        const publicMethod = normalizePublicMethod(
            normalizedStory.public_method
                || (normalizedStory.public_status === 'approved' && normalizedStory.is_public ? 'approved' : null)
                || (normalizedStory.public_status === 'pending' ? 'request' : null)
                || 'private'
        );
        setForm({
            title: normalizedStory.title,
            background: normalizedStory.background,
            environment: normalizedStory.environment,
            is_public: publicMethod !== 'private',
            public_method: publicMethod,
            cover_image_url: normalizedStory.cover_image_url || '',
            characters: normalizedStory.characters || [],
        });
        setActiveStory(normalizedStory);
        setEditMode('edit');
        navigate('studio');
    };

    const saveStory = async () => {
        if (!form.title?.trim()) { alert('이야기 제목을 입력하세요'); return; }
        if (form.characters && form.characters.length > 7) { alert('등장인물은 최대 7명까지만 가능합니다.'); return; }
        if (editMode === 'new' && stories.length >= getStoryLimitForUser(user)) {
            alert(`이야기는 최대 ${getStoryLimitForUser(user)}개까지 보유할 수 있습니다.`);
            return;
        }

        try {
            if (editMode === 'new') {
                const res = await createStory(form);
                if (res.error) throw new Error(res.error);
            } else if (activeStory) {
                const res = await updateStory(activeStory.id, form);
                if (res.error) throw new Error(res.error);
            }
            await loadStories();
            navigate('home');
        } catch (err: unknown) {
            console.error('Save failed:', err);
            alert(`저장 실패: ${getErrorMessage(err)}`);
        }
    };

    const removeStory = async (id: number) => {
        if (!confirm('이야기와 속한 등장인물, 소설 기록이 모두 삭제됩니다. 정말 삭제할까요?')) return;
        try {
            await deleteStory(id);
            await loadStories();
        } catch (err: unknown) {
            console.error('Delete failed:', err);
            alert(`삭제 실패: ${getErrorMessage(err)}`);
        }
    };

    const reloadActiveStoryMessages = async (storyId: number) => {
        const history = await fetchStoryMessages(storyId);
        setStoryMessages(history);
        return history;
    };

    const openStoryReader = async (story: Story) => {
        try {
            const normalizedStory = normalizeStoryForClient(story);
            setActiveStory(normalizedStory);
            setEditingMessageId(null);
            setEditingMessageDraft('');
            setEditedMessageScrollTargetId(null);
            // 매번 기본값에서 시작해 스토리별 설정만 덮어써야 이전 스토리의 설정이 섞이지 않습니다.
            setReaderSettings({
                ...DEFAULT_READER_SETTINGS,
                ...(normalizedStory.viewer_settings || {}),
            });
            setBindingPreview(null);
            setBindingOptions({ ...DEFAULT_BINDING_OPTIONS });
            setBindingQuoteOpen(false);
            setBindingOpenError('');
            await reloadActiveStoryMessages(normalizedStory.id);
            isInitialChatLoad.current = true;
            navigate('chat'); // chat view is actually the reader
        } catch (err: unknown) {
            console.error('Open reader failed:', err);
            alert(`집필 창을 열 수 없습니다: ${getErrorMessage(err)}`);
        }
    };

    const createBindingPreview = (
        optionsInput: BindingOptions,
        sourceStory: Story | null = activeStory,
        sourceMessages: StoryMessage[] = storyMessages,
        sourceViewerSettings: Partial<ReaderSettings> = readerSettings,
        sourceRemainingPoints: number = pointData?.pointBalance ?? user?.point_balance ?? 0
    ): BindingSession | null => {
        if (!sourceStory) return null;

        const options = normalizeBindingOptions(optionsInput);
        const messages = [...sourceMessages];
        const pages = buildBindingPages({
            title: sourceStory.title || '',
            background: sourceStory.background || '',
            environment: sourceStory.environment || '',
            messages,
            viewerSettings: {
                ...DEFAULT_BINDING_VIEWER_SETTINGS,
                ...sourceViewerSettings,
            },
            options,
        }) as BindingPage[];

        return {
            storyId: sourceStory.id,
            title: sourceStory.title || '',
            background: sourceStory.background || '',
            environment: sourceStory.environment || '',
            options,
            viewerSettings: {
                ...DEFAULT_BINDING_VIEWER_SETTINGS,
                ...sourceViewerSettings,
            },
            messages,
            pageCount: pages.length,
            cost: pages.length,
            remainingPoints: sourceRemainingPoints,
            coverImageUrl: sourceStory.cover_image_url || null,
            authorName: user?.name || null,
            createdAt: sourceStory.created_at || null,
            pages,
        };
    };

    const syncBindingPreview = (nextOptions: BindingOptions) => {
        const normalizedOptions = normalizeBindingOptions(nextOptions);
        setBindingOptions(normalizedOptions);
        const preview = createBindingPreview(normalizedOptions);
        if (preview) {
            setBindingPreview(preview);
        }
        return preview;
    };

    const openBindingQuote = () => {
        if (!activeStory) {
            alert('이야기를 먼저 열어주세요.');
            return;
        }
        if (storyMessages.length === 0) {
            alert('제본할 내용이 없습니다.');
            return;
        }

        const nextPreview = syncBindingPreview(bindingOptions);
        setBindingOpenError('');
        setBindingQuoteOpen(true);
        setBindingPreview(nextPreview ?? createBindingPreview(bindingOptions));
    };

    const closeBindingQuote = () => {
        setBindingQuoteOpen(false);
        setBindingQuoteLoading(false);
        setBindingOpenError('');
    };

    const confirmBindingExport = async () => {
        if (!activeStory || bindingQuoteLoading) return;

        const draftPreview = bindingPreview ?? createBindingPreview(bindingOptions);
        const estimatedPages = draftPreview?.pages?.length ?? draftPreview?.pageCount ?? createBindingPreview(bindingOptions)?.pageCount ?? 1;
        const currentBalance = pointData?.pointBalance ?? user?.point_balance ?? 0;

        if (currentBalance < estimatedPages) {
            setBindingQuoteOpen(false);
            setInsufficientPointNeed(estimatedPages);
            setInsufficientPointHave(currentBalance);
            setInsufficientPointMessage('제본을 위한 포인트가 부족합니다 충전하시겠습니까?');
            setInsufficientPointsOpen(true);
            return;
        }

        try {
            setBindingQuoteLoading(true);
            const result = await prepareStoryBinding(activeStory.id, bindingOptions);
            const bindingData = result?.binding || {};
            const normalizedMessages = Array.isArray(bindingData.messages) ? bindingData.messages : [...storyMessages];
            const fallbackPages = buildBindingPages({
                title: String(bindingData.title ?? activeStory.title ?? ''),
                background: String(bindingData.background ?? activeStory.background ?? ''),
                environment: String(bindingData.environment ?? activeStory.environment ?? ''),
                messages: normalizedMessages,
                viewerSettings: {
                    ...readerSettings,
                    ...(bindingData.viewerSettings || {}),
                },
                options: bindingOptions,
            }) as BindingPage[];
            const pages = Array.isArray(bindingData.pages) && bindingData.pages.length ? (bindingData.pages as BindingPage[]) : fallbackPages;
            const nextPreview: BindingSession = {
                storyId: Number(bindingData.storyId ?? activeStory.id),
                title: String(bindingData.title ?? activeStory.title ?? ''),
                background: String(bindingData.background ?? activeStory.background ?? ''),
                environment: String(bindingData.environment ?? activeStory.environment ?? ''),
                options: normalizeBindingOptions(bindingData.options || bindingOptions),
                viewerSettings: {
                    ...readerSettings,
                    ...(bindingData.viewerSettings || {}),
                },
                messages: normalizedMessages,
                pageCount: Number(result?.pageCount ?? bindingData.pageCount ?? pages.length ?? estimatedPages ?? 1),
                cost: Number(result?.cost ?? bindingData.cost ?? pages.length ?? estimatedPages ?? 1),
                remainingPoints: Number(result?.remainingPoints ?? currentBalance),
                coverImageUrl: String(bindingData.coverImageUrl ?? activeStory.cover_image_url ?? '') || null,
                authorName: String(bindingData.authorName ?? user?.name ?? '') || null,
                createdAt: String(bindingData.createdAt ?? activeStory.created_at ?? '') || null,
                pages,
            };
            setBindingPreview(nextPreview);
            closeBindingQuote();
            navigate('binding');
        } catch (err: unknown) {
            console.error('Prepare binding export failed:', err);
            const message = getErrorMessage(err);
            if ((err as Error & { code?: string }).code === 'INSUFFICIENT_POINTS') {
                setBindingQuoteOpen(false);
                setInsufficientPointNeed(estimatedPages);
                setInsufficientPointHave(currentBalance);
                setInsufficientPointMessage('제본을 위한 포인트가 부족합니다 충전하시겠습니까?');
                setInsufficientPointsOpen(true);
                return;
            }
            setBindingOpenError(message);
        } finally {
            setBindingQuoteLoading(false);
        }
    };

    const handleBindingPrint = () => {
        if (!bindingPreview || bindingPrintChargeRunningRef.current || bindingPreview.pageCount <= 0) return;
        bindingPrintChargeRef.current = {
            storyId: bindingPreview.storyId,
            options: bindingPreview.options,
            cost: bindingPreview.cost,
        };
        window.print();
    };

    const updateBindingOption = (patch: Partial<BindingOptions>) => {
        const nextOptions = normalizeBindingOptions({ ...bindingOptions, ...patch });
        setBindingOptions(nextOptions);
        const preview = createBindingPreview(nextOptions);
        if (preview) {
            setBindingPreview(preview);
        }
    };

    const canEditStoryMessage = (message: StoryMessage) => {
        return Boolean(
            user
            && activeStory
            && activeStory.user_id === user.id
            && message.role === 'assistant'
        );
    };

    const beginEditStoryMessage = (message: StoryMessage) => {
        if (!canEditStoryMessage(message)) return;
        setEditingMessageId(message.id);
        setEditingMessageDraft(message.content);
        setEditedMessageScrollTargetId(message.id);
    };

    const cancelEditStoryMessage = () => {
        setEditingMessageId(null);
        setEditingMessageDraft('');
        setEditingMessageSaving(false);
        setEditedMessageScrollTargetId(null);
    };

    const saveEditedStoryMessage = async () => {
        if (!activeStory || editingMessageId === null || editingMessageSaving) return;
        const trimmed = editingMessageDraft.trim();
        if (!trimmed) {
            alert('수정할 내용을 입력하세요.');
            return;
        }

        try {
            setEditingMessageSaving(true);
            await updateStoryMessage(activeStory.id, editingMessageId, trimmed);
            setEditingMessageId(null);
            setEditingMessageDraft('');
            setEditedMessageScrollTargetId(editingMessageId);
            await reloadActiveStoryMessages(activeStory.id);
        } catch (err: unknown) {
            console.error('Edit story message failed:', err);
            alert(`메시지 수정 실패: ${getErrorMessage(err)}`);
        } finally {
            setEditingMessageSaving(false);
        }
    };

    const handleSend = async () => {
        const trimmed = msgInput.trim();
        if (!trimmed || !activeStory || isSending) {
            console.warn('집필 요청 차단:', {
                hasInput: Boolean(trimmed),
                activeStoryId: activeStory?.id ?? null,
                isSending,
            });
            if (!activeStory) {
                alert('이야기를 먼저 열어주세요.');
            }
            return;
        }
        const currentBalance = pointData?.pointBalance ?? user?.point_balance ?? 0;
        const pointsNeeded = pointData?.chatCost ?? getChatCostForUser(user);
        if (currentBalance < pointsNeeded) {
            setInsufficientPointNeed(pointsNeeded);
            setInsufficientPointHave(currentBalance);
            setInsufficientPointMessage('대화를 위한 포인트가 부족합니다 충전하시겠습니까?');
            setInsufficientPointsOpen(true);
            return;
        }
        const content = msgInput;
        const userMessageId = Date.now();
        setMsgInput('');
        setIsSending(true);
        setStoryMessages(prev => [...prev, { id: userMessageId, story_id: activeStory.id, user_id: user?.id ?? 0, role: 'user', content, created_at: '' }]);

        try {
            console.info('집필 요청 시작:', { storyId: activeStory.id, contentLength: content.length });
            const reply = await sendStoryMessage(activeStory.id, content);
            console.info('집필 요청 완료:', { storyId: activeStory.id, hasReply: Boolean(reply?.content) });
            setStoryMessages(prev => [...prev, { id: reply.id ?? Date.now() + 1, story_id: activeStory.id, user_id: user?.id ?? 0, role: 'assistant', content: reply.content, created_at: '' }]);
            if (typeof reply.remainingPoints === 'number') {
                setUser((current) => current ? { ...current, point_balance: reply.remainingPoints } : current);
                setPointData((current) => current ? {
                    ...current,
                    pointBalance: reply.remainingPoints,
                    recentTransactions: current.recentTransactions,
                } : current);
            }
            void loadPointData().catch(() => undefined);
        } catch (err: unknown) {
            console.error('집필 전송 실패:', err);
            const errorMessage = getErrorMessage(err) || '알 수 없는 오류';
            const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
            if (status === 402 || /포인트|insufficient/i.test(errorMessage)) {
                setStoryMessages(prev => prev.filter((message) => message.id !== userMessageId));
                setInsufficientPointNeed(pointsNeeded);
                setInsufficientPointHave(currentBalance);
                setInsufficientPointsOpen(true);
                return;
            }
            setStoryMessages(prev => [
                ...prev,
                {
                    id: Date.now() + 1,
                    story_id: activeStory.id,
                    user_id: user?.id ?? 0,
                    role: 'assistant',
                    content: `[오류] 집필 요청 실패: ${errorMessage}`,
                    created_at: ''
                }
            ]);
        } finally {
            setIsSending(false);
        }
    };

    const chargePoints = async (amount: number, packageName?: string) => {
        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }
        try {
            setPointError('');
            const result = await topUpPoints({ amount, packageName });
            const nextBalance = Number(result.pointBalance ?? result.point_balance ?? 0);
            setUser((current) => current ? { ...current, point_balance: nextBalance } : current);
            setPointData((current) => current ? {
                ...current,
                pointBalance: nextBalance,
                recentTransactions: current.recentTransactions,
            } : current);
            await loadPointData().catch(() => undefined);
            alert(`${formatPointAmount(amount)} 충전이 반영됐습니다.`);
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            setPointError(message);
            if (/본인인증|PHONE_VERIFICATION_REQUIRED/i.test(message)) {
                navigate('profile');
            }
            throw err;
        }
    };

    const handleLocalLogin = async () => {
        const email = localLoginEmail.trim();
        const password = localLoginPassword;
        if (!email || !password) {
            setLocalLoginError('이메일과 비밀번호를 입력해주세요.');
            return;
        }

        try {
            setLocalLoginLoading(true);
            setLocalLoginError('');
            const result = await loginLocalUser({ email, password });
            await applyAuthenticatedSession(result);
            setLocalLoginPassword('');
        } catch (err: unknown) {
            setLocalLoginError(getErrorMessage(err));
        } finally {
            setLocalLoginLoading(false);
        }
    };

    const handleSignupRequestCode = async () => {
        const phoneNumber = signupPhoneNumber.trim();
        if (!phoneNumber) {
            setSignupError('휴대폰 번호를 입력해주세요.');
            return;
        }
        try {
            setSignupPhoneSending(true);
            setSignupError('');
            const result = await requestPhoneVerification({ phoneNumber, purpose: 'signup' });
            setSignupPhoneRequestId(Number(result.verificationId));
            setSignupInfo(result.debugCode ? `개발용 인증번호: ${result.debugCode}` : '인증번호를 전송했습니다.');
        } catch (err: unknown) {
            setSignupError(getErrorMessage(err));
        } finally {
            setSignupPhoneSending(false);
        }
    };

    const handleSignupVerifyCode = async () => {
        if (!signupPhoneRequestId) {
            setSignupError('먼저 인증번호를 요청해주세요.');
            return;
        }
        const code = signupPhoneCode.trim();
        if (!code) {
            setSignupError('인증번호를 입력해주세요.');
            return;
        }

        try {
            setSignupPhoneVerifying(true);
            setSignupError('');
            const result = await verifyPhoneCode({ verificationId: signupPhoneRequestId, code });
            setSignupPhoneToken(result.verificationToken);
            setSignupInfo('휴대폰 인증이 완료되었습니다.');
        } catch (err: unknown) {
            setSignupError(getErrorMessage(err));
        } finally {
            setSignupPhoneVerifying(false);
        }
    };

    const handleSignupSubmit = async () => {
        if (!signupPhoneToken) {
            setSignupError('휴대폰 인증을 먼저 완료해주세요.');
            return;
        }
        if (!signupName.trim() || !signupEmail.trim() || !signupPassword) {
            setSignupError('이름, 이메일, 비밀번호를 모두 입력해주세요.');
            return;
        }

        try {
            setSignupLoading(true);
            setSignupError('');
            const result = await registerLocalUser({
                name: signupName.trim(),
                email: signupEmail.trim(),
                password: signupPassword,
                birthDate: signupBirthDate || undefined,
                phoneVerificationToken: signupPhoneToken,
            });
            await applyAuthenticatedSession(result);
            setSignupInfo('회원가입이 완료되었습니다. 환영 포인트가 지급됐습니다.');
            setSignupPassword('');
            setSignupPhoneCode('');
            setSignupPhoneToken('');
            setSignupPhoneRequestId(null);
        } catch (err: unknown) {
            setSignupError(getErrorMessage(err));
        } finally {
            setSignupLoading(false);
        }
    };

    const handleProfilePhoneRequest = async () => {
        if (!user) return;
        const phoneNumber = profilePhoneNumber.trim() || user.phone_number || '';
        if (!phoneNumber) {
            setProfileActionMessage('휴대폰 번호를 입력해주세요.');
            return;
        }

        try {
            setProfilePhoneSending(true);
            setProfileActionMessage('');
            const result = await requestPhoneVerification({ phoneNumber, purpose: 'identity', createdForUserId: user.id });
            setProfilePhoneRequestId(Number(result.verificationId));
            setProfilePhoneNumber(phoneNumber);
            setProfileActionMessage(result.debugCode ? `개발용 인증번호: ${result.debugCode}` : '인증번호를 전송했습니다.');
        } catch (err: unknown) {
            setProfileActionMessage(getErrorMessage(err));
        } finally {
            setProfilePhoneSending(false);
        }
    };

    const handleProfilePhoneVerify = async () => {
        if (!profilePhoneRequestId) {
            setProfileActionMessage('먼저 인증번호를 요청해주세요.');
            return;
        }

        try {
            setProfilePhoneVerifying(true);
            setProfileActionMessage('');
            const verifyResult = await verifyPhoneCode({ verificationId: profilePhoneRequestId, code: profilePhoneCode.trim() });
            const completeResult = await completePhoneVerification({ verificationToken: verifyResult.verificationToken });
            if (completeResult?.user) {
                setUser((current) => current ? { ...current, ...(completeResult.user as AuthUser) } : current);
            } else {
                const me = await fetchMe();
                if (me) {
                    setUser({ ...me, point_balance: Number(me.point_balance ?? 0) });
                }
            }
            setPointData((current) => current ? {
                ...current,
                canCharge: true,
                identityVerified: true,
            } : current);
            setProfileActionMessage('본인인증이 완료되었습니다.');
            setProfilePhoneCode('');
            setProfilePhoneRequestId(null);
        } catch (err: unknown) {
            setProfileActionMessage(getErrorMessage(err));
        } finally {
            setProfilePhoneVerifying(false);
        }
    };

    const handleProfileAdultRequest = async () => {
        if (!user) return;
        const phoneNumber = profileAdultPhoneNumber.trim() || user.phone_number || '';
        if (!phoneNumber) {
            setProfileActionMessage('성인인증용 휴대폰 번호를 입력해주세요.');
            return;
        }
        if (!profileAdultBirthDate.trim()) {
            setProfileActionMessage('생년월일을 입력해주세요.');
            return;
        }

        try {
            setProfileAdultSending(true);
            setProfileActionMessage('');
            const result = await requestPhoneVerification({ phoneNumber, purpose: 'adult', createdForUserId: user.id });
            setProfileAdultRequestId(Number(result.verificationId));
            setProfileAdultPhoneNumber(phoneNumber);
            setProfileActionMessage(result.debugCode ? `개발용 인증번호: ${result.debugCode}` : '성인인증 인증번호를 전송했습니다.');
        } catch (err: unknown) {
            setProfileActionMessage(getErrorMessage(err));
        } finally {
            setProfileAdultSending(false);
        }
    };

    const handleProfileAdultVerify = async () => {
        if (!profileAdultRequestId) {
            setProfileActionMessage('먼저 성인인증 인증번호를 요청해주세요.');
            return;
        }

        try {
            setProfileAdultVerifying(true);
            setProfileActionMessage('');
            const verifyResult = await verifyPhoneCode({ verificationId: profileAdultRequestId, code: profileAdultCode.trim() });
            const completeResult = await completeAdultVerification({
                verificationToken: verifyResult.verificationToken,
                birthDate: profileAdultBirthDate,
            });
            if (completeResult?.user) {
                setUser((current) => current ? { ...current, ...(completeResult.user as AuthUser) } : current);
            } else {
                const me = await fetchMe();
                if (me) {
                    setUser({ ...me, point_balance: Number(me.point_balance ?? 0) });
                }
            }
            setPointData((current) => current ? {
                ...current,
                adultVerified: true,
            } : current);
            setProfileActionMessage('성인인증이 완료되었습니다.');
            setProfileAdultCode('');
            setProfileAdultRequestId(null);
        } catch (err: unknown) {
            setProfileActionMessage(getErrorMessage(err));
        } finally {
            setProfileAdultVerifying(false);
        }
    };

    const handleClearChat = async () => {
        if (!activeStory || !confirm('집필 기록을 전부 삭제할까요?')) return;
        try {
            await clearStoryMessages(activeStory.id);
            setStoryMessages([]);
        } catch (err: unknown) {
            console.error('Clear chat failed:', err);
            alert(`초기화 실패: ${getErrorMessage(err)}`);
        }
    };

    // ── Reader Logic (Restored) ──────────────────────────────
    const scrollPage = (direction: 'next' | 'prev') => {
        if (!bookRef.current) return;
        const container = bookRef.current;
        const isTall = useVerticalReader;

        if (isTall) {
            const scrollAmount = container.clientHeight * 0.85;
            const targetScroll = direction === 'next' ? container.scrollTop + scrollAmount : container.scrollTop - scrollAmount;
            container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
            setSliderValue(Math.max(0, targetScroll));
        } else {
            const style = window.getComputedStyle(container);
            const paddingLeft = parseFloat(style.paddingLeft) || 0;
            const paddingRight = parseFloat(style.paddingRight) || 0;
            const gapStr = style.columnGap;
            const gap = gapStr === 'normal' ? 16 : (parseFloat(gapStr) || 0);
            const scrollAmount = container.clientWidth - paddingLeft - paddingRight + gap;
            const currentScroll = container.scrollLeft;
            let targetScroll = direction === 'next' ? currentScroll + scrollAmount : currentScroll - scrollAmount;
            targetScroll = Math.round(targetScroll / scrollAmount) * scrollAmount;
            container.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
            setSliderValue(Math.max(0, targetScroll));
        }
    };

    const getSliderMax = (): number => {
        if (!bookRef.current) return 100;
        const container = bookRef.current;
        if (useVerticalReader) {
            return Math.max(1, container.scrollHeight - container.clientHeight);
        }
        return Math.max(1, container.scrollWidth - container.clientWidth);
    };

    const handleSlider = (val: number) => {
        setSliderValue(val);
        if (!bookRef.current) return;
        const container = bookRef.current;
        if (useVerticalReader) {
            container.scrollTo({ top: val, behavior: 'smooth' });
        } else {
            const style = window.getComputedStyle(container);
            const paddingLeft = parseFloat(style.paddingLeft) || 0;
            const paddingRight = parseFloat(style.paddingRight) || 0;
            const gapStr = style.columnGap;
            const gap = gapStr === 'normal' ? 16 : (parseFloat(gapStr) || 0);
            const pageWidth = container.clientWidth - paddingLeft - paddingRight + gap;
            const snapped = Math.round(val / pageWidth) * pageWidth;
            container.scrollTo({ left: snapped, behavior: 'smooth' });
        }
    };

    const loadAdminDashboard = useCallback(
        async (params: Record<string, string | number | undefined> = {}, mode: 'main' | 'database' = 'main') => {
            const setLoading = mode === 'database' ? setAdminDatabaseLoading : setAdminLoading;
            const setError = mode === 'database' ? setAdminDatabaseError : setAdminError;

            setLoading(true);
            setError('');
            try {
                const dashboard = await fetchAdminDashboard(params);
                setAdminDashboard(dashboard);
                const selected = dashboard.databaseStats?.selectedRange;
                if (selected) {
                    setAdminStatsPreset(selected.preset);
                    setAdminStatsStart(toLocalDatetimeInput(selected.start));
                    setAdminStatsEnd(toLocalDatetimeInput(selected.end));
                }
                return dashboard;
            } catch (err: unknown) {
                console.error('Load admin dashboard failed:', err);
                const message = getErrorMessage(err);
                setError(message);
                throw err;
            } finally {
                setLoading(false);
            }
        },
        []
    );

    const openAdmin = async () => {
        try {
            await loadAdminDashboard();
            setAdminTab('overview');
            setAdminDatabaseView('stats');
            setAdminQuery('');
            navigate('admin');
        } catch (err: unknown) {
            const message = getErrorMessage(err);
            alert(`관리자 페이지를 불러올 수 없습니다: ${message}`);
        }
    };

    useEffect(() => {
        if (view !== 'admin' || !user || user.role !== 'admin' || adminDashboard || adminLoading) return;

        let cancelled = false;
        const loadDashboard = async () => {
            try {
                await loadAdminDashboard();
                if (cancelled) return;
                setAdminTab('overview');
                setAdminDatabaseView('stats');
                setAdminQuery('');
            } catch (err: unknown) {
                if (cancelled) return;
                console.error('Auto-load admin dashboard failed:', err);
            } finally {
                if (cancelled) {
                    setAdminLoading(false);
                }
            }
        };

        void loadDashboard();
        return () => {
            cancelled = true;
        };
    }, [view, user, adminDashboard, adminLoading, loadAdminDashboard]);

    useEffect(() => {
        if (view !== 'community' || !user || communityStories.length || communityLoading) return;
        void loadCommunityStories();
    }, [view, user, communityStories.length, communityLoading, loadCommunityStories]);

    useEffect(() => {
        if (!user || pointLoading) return;
        if (pointDataLoadedForUserRef.current === user.id) return;
        pointDataLoadedForUserRef.current = user.id;
        void loadPointData();
    }, [user, pointLoading, loadPointData]);

    useEffect(() => {
        if (!user) return;
        setProfilePhoneNumber(user.phone_number || '');
        setProfileAdultPhoneNumber(user.phone_number || '');
        setProfileAdultBirthDate(user.birth_date || '');
        setProfilePhoneRequestId(null);
        setProfilePhoneCode('');
        setProfileAdultRequestId(null);
        setProfileAdultCode('');
        setProfileActionMessage('');
    }, [user]);

    useEffect(() => {
        if (editingMessageId === null) return;
        const frame = requestAnimationFrame(() => {
            editingMessageTextareaRef.current?.focus();
            const valueLength = editingMessageTextareaRef.current?.value.length ?? 0;
            editingMessageTextareaRef.current?.setSelectionRange(valueLength, valueLength);
        });
        return () => cancelAnimationFrame(frame);
    }, [editingMessageId, storyMessages]);

    useEffect(() => {
        if (!editedMessageScrollTargetId) return;
        const target = storyMessageRefs.current[editedMessageScrollTargetId];
        if (!target) return;
        const frame = requestAnimationFrame(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            setEditedMessageScrollTargetId(null);
        });
        return () => cancelAnimationFrame(frame);
    }, [editedMessageScrollTargetId, storyMessages, view]);

    useEffect(() => {
        if (view !== 'admin' || adminTab !== 'points' || adminPointLoading) return;
        if (adminPointDashboardLoadedRef.current) return;
        adminPointDashboardLoadedRef.current = true;
        void loadAdminPointDashboard();
    }, [view, adminTab, adminPointLoading, loadAdminPointDashboard]);

    const openAdminStoryDetail = async (storyId: number) => {
        try {
            setAdminStoryLoading(true);
            const detail = await fetchAdminStoryDetail(storyId);
            setAdminStoryDetail(detail);
        } catch (err: unknown) {
            console.error('Open admin story detail failed:', err);
            alert(`이야기 상세를 불러올 수 없습니다: ${getErrorMessage(err)}`);
        } finally {
            setAdminStoryLoading(false);
        }
    };

    const getCurrentAdminRangeParams = () => buildAdminRangeParams(adminStatsPreset, adminStatsStart, adminStatsEnd);

    const refreshAdminData = async () => {
        const params = getCurrentAdminRangeParams();
        await loadAdminDashboard(params || {}, 'main');
    };

    const applyAdminPeriod = async () => {
        const params = buildAdminRangeParams(adminStatsPreset, adminStatsStart, adminStatsEnd);
        if (!params) {
            alert('기간을 다시 확인해주세요.');
            return;
        }

        try {
            await loadAdminDashboard(params, 'database');
        } catch (err: unknown) {
            alert(`기간 통계를 불러올 수 없습니다: ${getErrorMessage(err)}`);
        }
    };

    const applyAdminPreset = async (preset: '24h' | '7d' | '30d') => {
        const presetRange = getPresetRange(preset);
        setAdminStatsPreset(preset);
        setAdminStatsStart(presetRange.start);
        setAdminStatsEnd(presetRange.end);

        const params = buildAdminRangeParams(preset, presetRange.start, presetRange.end);
        if (!params) return;

        try {
            await loadAdminDashboard(params, 'database');
        } catch (err: unknown) {
            alert(`기간 통계를 불러올 수 없습니다: ${getErrorMessage(err)}`);
        }
    };

    const toggleAdminSeriesFilter = (key: AdminSeriesKey) => {
        setAdminSeriesFilters((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            if (!Object.values(next).some(Boolean)) {
                return prev;
            }
            return next;
        });
    };

    const toggleAdminStoryVisibility = async (storyId: number, nextPublic: boolean) => {
        if (!confirm(`이야기를 ${nextPublic ? '공개' : '비공개'}로 전환할까요?`)) return;
        try {
            setAdminMutation(`story:${storyId}:visibility`);
            await updateAdminStoryVisibility(storyId, nextPublic);
            await refreshAdminData();
            if (adminStoryDetail?.story.id === storyId) {
                await openAdminStoryDetail(storyId);
            }
        } catch (err: unknown) {
            console.error('Toggle story visibility failed:', err);
            alert(`공개 설정 변경 실패: ${getErrorMessage(err)}`);
        } finally {
            setAdminMutation(null);
        }
    };

    const deleteAdminStoryById = async (storyId: number) => {
        if (!confirm('이야기를 정말 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
        try {
            setAdminMutation(`story:${storyId}:delete`);
            await deleteAdminStory(storyId);
            setAdminStoryDetail((current) => (current?.story.id === storyId ? null : current));
            await refreshAdminData();
        } catch (err: unknown) {
            console.error('Delete admin story failed:', err);
            alert(`이야기 삭제 실패: ${getErrorMessage(err)}`);
        } finally {
            setAdminMutation(null);
        }
    };

    const updateAdminUserStatus = async (userId: number, patch: { isPremium?: boolean; isSuspended?: boolean; canPublishCommunity?: boolean }) => {
        const isPremium = patch.isPremium ?? undefined;
        const isSuspended = patch.isSuspended ?? undefined;
        const canPublishCommunity = patch.canPublishCommunity ?? undefined;
        const confirmText =
            isSuspended !== undefined
                ? `회원을 ${isSuspended ? '정지' : '정지 해제'}할까요?`
                : canPublishCommunity !== undefined
                    ? `커뮤니티 공개 권한을 ${canPublishCommunity ? '부여' : '회수'}할까요?`
                    : `프리미엄 상태를 ${isPremium ? '켜기' : '끄기'}로 바꿀까요?`;
        if (!confirm(confirmText)) return;

        try {
            setAdminMutation(`user:${userId}`);
            const currentUser = adminDashboard?.users.find((u) => u.id === userId);
            await updateAdminUser(userId, {
                isPremium: isPremium ?? currentUser?.isPremium ?? false,
                isSuspended: isSuspended ?? currentUser?.isSuspended ?? false,
                canPublishCommunity: canPublishCommunity ?? currentUser?.canPublishCommunity ?? false,
            });
            await refreshAdminData();
            if (adminTab === 'points') {
                await loadAdminPointDashboard().catch(() => undefined);
            }
            if (adminPointUserDetail?.user.id === userId) {
                await openAdminPointUser(userId);
            }
        } catch (err: unknown) {
            console.error('Update admin user failed:', err);
            alert(`회원 상태 변경 실패: ${getErrorMessage(err)}`);
        } finally {
            setAdminMutation(null);
        }
    };

    const handleAdminPointAdjustment = async () => {
        if (!adminPointUserDetail) return;
        const amount = Math.trunc(Number(adminPointAdjustment));
        if (!Number.isFinite(amount) || amount === 0) {
            alert('지급은 양수, 회수는 음수로 입력해주세요.');
            return;
        }

        try {
            setAdminMutation(`point:${adminPointUserDetail.user.id}`);
            await adjustAdminUserPoints(adminPointUserDetail.user.id, {
                amount,
                note: adminPointAdjustmentNote.trim() || '관리자 수동 조정',
            });
            await refreshAdminData();
            await loadAdminPointDashboard().catch(() => undefined);
            await openAdminPointUser(adminPointUserDetail.user.id);
            if (user?.id === adminPointUserDetail.user.id) {
                await loadPointData().catch(() => undefined);
            }
        } catch (err: unknown) {
            console.error('Adjust admin user points failed:', err);
            alert(`포인트 조정 실패: ${getErrorMessage(err)}`);
        } finally {
            setAdminMutation(null);
        }
    };

    // ── Render helpers ───────────────────────────────────────
    const renderNav = () => (
        <nav className="top-nav">
            <div className="nav-brand" onClick={() => navigate('home')}>
                <BookOpen size={24} className="text-accent" />
                <span>Bana<span className="text-accent">Novel 🍌</span></span>
            </div>
            {user && (
                <div className="nav-actions">
                    <button className="btn nav-point-pill" onClick={() => navigate('points')}>
                        <Coins size={16} /> 포인트 {formatPointAmount(pointData?.pointBalance ?? user.point_balance)}
                    </button>
                    <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }} onClick={() => navigate('profile')}>
                        마이페이지
                    </button>
                    {user.role === 'admin' && (
                        <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }} onClick={openAdmin}>
                            <ShieldAlert size={16} /> 관리자
                        </button>
                    )}
                    <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }} onClick={() => void openCommunity()}>
                        <Globe size={16} /> 커뮤니티
                    </button>
                    {!user.is_premium && (
                        <button className="btn btn-outline" style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                            <CreditCard size={16} /> 프리미엄
                        </button>
                    )}
                    <span className="text-muted" style={{ fontSize: '0.9rem' }}>{user.name}</span>
                    <button className="btn-icon" onClick={logout}><LogOut size={20} /></button>
                </div>
            )}
            {!user && (
                <div className="nav-actions">
                    <button className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }} onClick={() => navigate('login')}>
                        <Users size={16} /> 로그인
                    </button>
                </div>
            )}
        </nav>
    );

    // ── Login view ───────────────────────────────────────────
    const renderLogin = () => (
        <div className="main-content fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 60px)' }}>
            <div className="login-shell">
                <div className="glass-panel login-hero">
                    <BookOpen size={48} className="text-accent" style={{ marginBottom: '1rem' }} />
                    <span className="badge badge-gold">정식 회원가입 · SMS 인증 · 포인트 충전</span>
                    <h1 className="title-font" style={{ fontSize: '2rem', margin: '1rem 0 0.75rem' }}>
                        Novel<span className="text-accent">AI</span>
                    </h1>
                    <p className="text-muted" style={{ lineHeight: 1.7, maxWidth: 520 }}>
                        SNS 로그인은 그대로 두고, 이메일 회원가입과 휴대폰 인증을 추가했습니다.
                        포인트 충전은 본인인증 후에만 가능하고, 마이페이지에서 성인인증도 진행할 수 있습니다.
                    </p>

                    <div className="login-feature-grid">
                        <div className="glass-panel login-feature-card">
                            <Users size={20} className="text-accent" />
                            <strong>로컬 회원가입</strong>
                            <p className="text-muted">SNS 없이 이메일과 비밀번호로 가입할 수 있습니다.</p>
                        </div>
                        <div className="glass-panel login-feature-card">
                            <WalletCards size={20} className="text-accent" />
                            <strong>본인인증 후 충전</strong>
                            <p className="text-muted">문자 인증을 통과해야 포인트 충전이 열립니다.</p>
                        </div>
                        <div className="glass-panel login-feature-card">
                            <ShieldAlert size={20} className="text-accent" />
                            <strong>성인인증</strong>
                            <p className="text-muted">마이페이지에서 성인 인증 플래그를 설정할 수 있습니다.</p>
                        </div>
                    </div>
                </div>

                <div className="glass-panel login-panel">
                    <div className="login-toggle-row">
                        <button className={`btn ${authMode === 'login' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setAuthMode('login')}>
                            로그인
                        </button>
                        <button className={`btn ${authMode === 'signup' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setAuthMode('signup')}>
                            회원가입
                        </button>
                    </div>

                    {authMode === 'login' ? (
                        <div className="auth-form">
                            <div className="input-group">
                                <label>이메일</label>
                                <input className="input-control" type="email" value={localLoginEmail} onChange={(e) => setLocalLoginEmail(e.target.value)} placeholder="you@example.com" />
                            </div>
                            <div className="input-group">
                                <label>비밀번호</label>
                                <input className="input-control" type="password" value={localLoginPassword} onChange={(e) => setLocalLoginPassword(e.target.value)} placeholder="비밀번호를 입력하세요" />
                            </div>
                            {localLoginError && <p className="text-negative" style={{ marginTop: '-0.25rem' }}>{localLoginError}</p>}
                            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void handleLocalLogin()} disabled={localLoginLoading}>
                                {localLoginLoading ? '로그인 중...' : '이메일로 로그인'}
                            </button>
                            <p className="input-help">SNS 없이 가입한 계정은 여기서 로그인합니다.</p>
                        </div>
                    ) : (
                        <div className="auth-form">
                            <div className="input-group">
                                <label>이름</label>
                                <input className="input-control" value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="이름" />
                            </div>
                            <div className="input-group">
                                <label>이메일</label>
                                <input className="input-control" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} placeholder="you@example.com" />
                            </div>
                            <div className="input-group">
                                <label>비밀번호</label>
                                <input className="input-control" type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} placeholder="최소 8자" />
                            </div>
                            <div className="input-group">
                                <label>생년월일</label>
                                <input className="input-control" type="date" value={signupBirthDate} onChange={(e) => setSignupBirthDate(e.target.value)} />
                                <p className="input-help">선택 입력입니다. 마이페이지에서 성인인증을 다시 할 수 있습니다.</p>
                            </div>
                            <div className="input-group">
                                <label>휴대폰 번호</label>
                                <input className="input-control" value={signupPhoneNumber} onChange={(e) => setSignupPhoneNumber(e.target.value)} placeholder="01012345678" />
                            </div>
                            <div className="inline-actions">
                                <button className="btn btn-outline" type="button" onClick={() => void handleSignupRequestCode()} disabled={signupPhoneSending}>
                                    {signupPhoneSending ? '전송 중...' : '인증번호 받기'}
                                </button>
                                <span className="text-muted" style={{ fontSize: '0.85rem' }}>{signupPhoneRequestId ? '인증번호가 발송됐습니다.' : '먼저 휴대폰 번호를 입력하세요.'}</span>
                            </div>
                            <div className="input-group">
                                <label>인증번호</label>
                                <input className="input-control" inputMode="numeric" value={signupPhoneCode} onChange={(e) => setSignupPhoneCode(e.target.value)} placeholder="6자리 숫자" />
                            </div>
                            <div className="inline-actions">
                                <button className="btn btn-outline" type="button" onClick={() => void handleSignupVerifyCode()} disabled={signupPhoneVerifying || !signupPhoneRequestId}>
                                    {signupPhoneVerifying ? '확인 중...' : '번호 확인'}
                                </button>
                                <span className="text-muted" style={{ fontSize: '0.85rem' }}>{signupPhoneToken ? '휴대폰 인증 완료' : '인증번호 확인 후 가입할 수 있어요.'}</span>
                            </div>
                            {signupInfo && <p className="text-muted">{signupInfo}</p>}
                            {signupError && <p className="text-negative">{signupError}</p>}
                            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void handleSignupSubmit()} disabled={signupLoading || !signupPhoneToken}>
                                {signupLoading ? '가입 중...' : '회원가입하기'}
                            </button>
                            <p className="input-help">가입 즉시 웰컴 포인트 50P가 지급됩니다.</p>
                        </div>
                    )}

                    <div className="login-divider">
                        <span>또는 SNS로 계속</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        <a href={oauthUrl.kakao} className="btn" style={{ background: '#FEE500', color: '#3C1E1E', justifyContent: 'center', fontWeight: 600 }}>
                            카카오로 로그인
                        </a>
                        <a href={oauthUrl.naver} className="btn" style={{ background: '#03C75A', color: 'white', justifyContent: 'center', fontWeight: 600 }}>
                            네이버로 로그인
                        </a>
                        <a href={oauthUrl.google} className="btn" style={{ background: 'white', color: '#333', justifyContent: 'center', fontWeight: 600, border: '1px solid #ddd' }}>
                            구글로 로그인
                        </a>
                        <button
                            type="button"
                            className="btn"
                            style={{ background: '#111', color: 'white', justifyContent: 'center', fontWeight: 600 }}
                            onClick={() => {
                                localStorage.setItem('token', APPLE_ADMIN_LOCAL_TOKEN);
                                window.location.assign('/');
                            }}
                        >
                            애플로 관리자 로그인
                        </button>
                    </div>

                    <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: '1.5rem', lineHeight: 1.5, textAlign: 'center' }}>
                        로그인 시 서비스 이용약관 및 개인정보처리방침에 동의하게 됩니다.
                    </p>
                </div>
            </div>
        </div>
    );

    // ── Home: story list ─────────────────────────────────
    const renderHome = () => (
        <div className="main-content fade-in">
            <div className="home-hero glass-panel" style={{ marginBottom: '1rem' }}>
                <div className="home-hero-copy">
                    <h1 className="title-font" style={{ fontSize: '1.8rem' }}>나의 소설</h1>
                    <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.35rem' }}>
                        새로운 세계관과 인물을 만들고 이야기를 이어 써보세요
                    </p>
                </div>
                <div className="home-hero-actions">
                    {user ? (
                        <>
                            <button className="btn btn-outline" onClick={() => navigate('points')}>
                                <Coins size={16} /> 충전하기
                            </button>
                            <button className="btn btn-primary" onClick={openNewStory} disabled={stories.length >= getStoryLimitForUser(user)}>
                                <Plus size={18} /> 새 이야기
                            </button>
                        </>
                    ) : (
                        <button className="btn btn-primary" onClick={() => navigate('login')}>
                            <Users size={18} /> 로그인
                        </button>
                    )}
                </div>
            </div>

            {user ? (
                <>
                    <div className="home-stats-grid" style={{ marginBottom: '1rem' }}>
                        <div className="glass-panel home-stat-card">
                            <div className="home-stat-head">
                                <span className="badge badge-green">이야기 보유</span>
                                <BookOpen size={18} className="text-accent" />
                            </div>
                            <strong className="home-stat-value">{stories.length} / {getStoryLimitForUser(user)}</strong>
                            <p className="text-muted">
                                {stories.length >= getStoryLimitForUser(user)
                                    ? '보유 개수에 도달했습니다. 기존 이야기를 정리하거나 프리미엄을 확인해보세요.'
                                    : '이야기는 무료로 만들 수 있습니다. 프리미엄은 30개, 일반 회원은 3개까지 보유할 수 있어요.'}
                            </p>
                            <button
                                className="btn btn-outline"
                                style={{ marginTop: '0.85rem', width: '100%' }}
                                onClick={openNewStory}
                                disabled={stories.length >= getStoryLimitForUser(user)}
                            >
                                새 이야기 만들기
                            </button>
                        </div>
                        <div className="glass-panel home-stat-card">
                            <div className="home-stat-head">
                                <span className="badge badge-gold">빠른 이동</span>
                                <Sparkles size={18} className="text-accent" />
                            </div>
                            <strong className="home-stat-value">메인 바로가기</strong>
                            <p className="text-muted">상단바의 포인트 배지와 관리자/커뮤니티 메뉴로 이동할 수 있습니다.</p>
                            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => navigate('points')}>
                                    포인트
                                </button>
                                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => navigate('profile')}>
                                    마이페이지
                                </button>
                                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => void openCommunity()}>
                                    커뮤니티
                                </button>
                            </div>
                        </div>
                    </div>

                    {stories.length === 0 ? (
                        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                            <BookOpen size={60} className="text-muted" style={{ margin: '0 auto 1rem' }} />
                            <p className="text-muted">아직 작성 중인 이야기가 없습니다.<br />새 이야기를 만들어 상상력을 펼쳐보세요!</p>
                        </div>
                    ) : (
                        <div className="char-grid">
                            {stories.map(story => (
                                <div className="char-card glass-panel" key={story.id}>
                                    <div className="char-info" style={{ paddingBottom: '1rem' }}>
                                        <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{story.title}</h3>
                                        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem', minHeight: '40px' }}>
                                            {story.background?.slice(0, 60) || '배경 설명이 없습니다.'}...
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                            <Users size={14} className="text-accent" />
                                            <span style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>
                                                등장인물 {story.characters?.length || 0}명
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {story.public_status === 'approved'
                                                ? <Globe size={14} className="text-muted" />
                                                : <Lock size={14} className="text-muted" />}
                                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                {resolveStoryVisibilityInfo({
                                                    isPublic: story.is_public ? 1 : 0,
                                                    publicStatus: story.public_status || null,
                                                    publicMethod: story.public_method || null,
                                                }).label}
                                            </span>
                                        </div>
                                        {story.public_status === 'rejected' && story.public_review_message && (
                                            <p className="text-muted" style={{ marginTop: '0.4rem', fontSize: '0.75rem', lineHeight: 1.4 }}>
                                                반려 사유: {story.public_review_message}
                                            </p>
                                        )}
                                    </div>
                                    <div className="char-actions">
                                        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => openStoryReader(story)}>
                                            <BookOpen size={16} /> 이어쓰기
                                        </button>
                                        <button className="btn btn-outline" onClick={() => openEditStory(story)}>
                                            <Settings size={16} />
                                        </button>
                                        <button className="btn btn-outline" style={{ color: '#f87171', borderColor: '#f87171' }} onClick={() => removeStory(story.id)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <div className="landing-shell">
                    <div className="glass-panel landing-hero">
                        <div className="landing-hero-copy">
                            <span className="badge badge-gold">비로그인 방문자</span>
                            <h2 className="title-font landing-title">이야기는 가볍게, 로그인은 필요할 때만</h2>
                            <p className="text-muted landing-subtitle">
                                누구나 분위기를 둘러볼 수 있는 첫 화면입니다. 로그인하면 내 이야기, 포인트, 관리자 기능이 바로 열립니다.
                            </p>
                            <div className="landing-actions">
                                <button className="btn btn-primary" onClick={() => navigate('login')}>
                                    <Users size={18} /> 로그인하기
                                </button>
                                <button className="btn btn-outline" onClick={() => navigate('community')}>
                                    <Globe size={18} /> 둘러보기
                                </button>
                            </div>
                        </div>
                        <div className="landing-feature-grid">
                            <div className="glass-panel landing-feature-card">
                                <BookOpen size={24} className="text-accent" />
                                <strong>이야기 생성</strong>
                                <p className="text-muted">무료로 이야기와 주인공을 만들 수 있습니다.</p>
                            </div>
                            <div className="glass-panel landing-feature-card">
                                <Coins size={24} className="text-accent" />
                                <strong>포인트 충전</strong>
                                <p className="text-muted">로그인 후 채팅 비용과 충전 내역을 확인합니다.</p>
                            </div>
                            <div className="glass-panel landing-feature-card">
                                <ShieldAlert size={24} className="text-accent" />
                                <strong>관리자 접근</strong>
                                <p className="text-muted">Apple 버튼으로 관리자로 접속할 수 있습니다.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderCommunity = () => {
        if (!user) {
            return (
                <div className="main-content fade-in">
                    <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                        <Globe size={56} className="text-accent" style={{ margin: '0 auto 1rem' }} />
                        <h2 className="title-font" style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>로그인이 필요합니다</h2>
                        <p className="text-muted" style={{ lineHeight: 1.7 }}>
                            커뮤니티 작품은 로그인 후 확인할 수 있습니다.
                        </p>
                        <div style={{ marginTop: '1.2rem' }}>
                            <button className="btn btn-primary" onClick={() => navigate('login')}>
                                <Users size={18} /> 로그인
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        const countFmt = new Intl.NumberFormat('ko-KR');
        const query = communityQuery.trim().toLowerCase();
        const filteredStories = communityStories
            .filter((story) => {
                if (!query) return true;
                return [
                    story.title,
                    story.background,
                    story.environment,
                    story.authorName,
                    story.authorRole,
                    story.id,
                ].some((value) => String(value ?? '').toLowerCase().includes(query));
            })
            .slice()
            .sort((a, b) => {
                if (communitySort === 'oldest') return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
                if (communitySort === 'title') return a.title.localeCompare(b.title, 'ko-KR');
                if (communitySort === 'author') return (a.authorName || '').localeCompare(b.authorName || '', 'ko-KR');
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            });

        return (
            <div className="main-content fade-in">
                <div className="admin-hero glass-panel" style={{ marginBottom: '1rem' }}>
                    <div>
                        <div className="admin-hero-title">
                            <Globe size={22} className="text-accent" />
                            <h1 className="title-font" style={{ fontSize: '1.6rem' }}>커뮤니티</h1>
                        </div>
                        <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                            관리자 승인 공개와 직접 공개 작품을 함께 모아 봅니다.
                        </p>
                    </div>
                    <div className="admin-hero-actions">
                        <button className="btn btn-outline" onClick={() => void loadCommunityStories()} disabled={communityLoading}>
                            <RefreshCw size={16} /> 새로고침
                        </button>
                        <button className="btn btn-outline" onClick={() => navigate('home')}>
                            <ChevronLeft size={16} /> 내 작품
                        </button>
                    </div>
                </div>

                <div className="glass-panel community-toolbar" style={{ marginBottom: '1rem' }}>
                    <div className="community-toolbar-search">
                        <Search size={16} className="text-muted" />
                        <input
                            className="admin-search-input"
                            placeholder="제목, 작가, 배경, 환경 검색"
                            value={communityQuery}
                            onChange={(e) => setCommunityQuery(e.target.value)}
                        />
                    </div>
                    <div className="community-toolbar-actions">
                        <label>
                            <span>정렬</span>
                            <select
                                className="input-control"
                                value={communitySort}
                                onChange={(e) => setCommunitySort(e.target.value as typeof communitySort)}
                            >
                                <option value="latest">최신순</option>
                                <option value="oldest">오래된 순</option>
                                <option value="title">제목순</option>
                                <option value="author">작가순</option>
                            </select>
                        </label>
                        <div className="community-toolbar-meta text-muted">
                            총 {countFmt.format(communityStories.length)}편 · 검색 {countFmt.format(filteredStories.length)}편
                        </div>
                    </div>
                </div>

                {communityError && (
                    <div className="glass-panel" style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.08)', marginBottom: '1rem' }}>
                        <strong>커뮤니티 불러오기 실패</strong>
                        <p className="text-muted" style={{ marginTop: '0.35rem' }}>{communityError}</p>
                    </div>
                )}

                {communityLoading && communityStories.length === 0 ? (
                    <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                        <p className="text-muted">커뮤니티 작품을 불러오는 중입니다...</p>
                    </div>
                ) : filteredStories.length === 0 ? (
                    <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
                        <p className="text-muted">
                            {communityStories.length === 0 ? '아직 공개된 작품이 없습니다.' : '검색 조건에 맞는 작품이 없습니다.'}
                        </p>
                    </div>
                ) : (
                    <div className="community-grid">
                        {filteredStories.map((story) => (
                            <div key={story.id} className="community-card glass-panel">
                                <div
                                    className={`community-cover ${story.coverImageUrl ? '' : 'is-placeholder'}`}
                                    style={{ backgroundImage: story.coverImageUrl ? `url(${story.coverImageUrl})` : 'linear-gradient(180deg, #2f2f45 0%, #141825 100%)' }}
                                >
                                    {!story.coverImageUrl && <span>표지 없음</span>}
                                </div>
                                <div className="community-card-body">
                                    <div className="community-card-head">
                                        <div>
                                            <h3>{story.title}</h3>
                                            <p className="text-muted community-card-sub">
                                                {story.authorName || '알 수 없음'} · {story.environment || '환경 미설정'}
                                            </p>
                                        </div>
                                        <span className={`badge ${resolveStoryVisibilityInfo({
                                            isPublic: story.isPublic,
                                            publicStatus: story.publicStatus || null,
                                            publicMethod: story.publicMethod || null,
                                        }).badge}`}>
                                            {resolveStoryVisibilityInfo({
                                                isPublic: story.isPublic,
                                                publicStatus: story.publicStatus || null,
                                                publicMethod: story.publicMethod || null,
                                            }).label}
                                        </span>
                                    </div>
                                    <p className="community-card-text">
                                        {story.background || '배경 설명이 없습니다.'}
                                    </p>
                                    <div className="community-card-meta">
                                        <span>업데이트 {story.updatedAt.slice(0, 10)}</span>
                                        <span>작가 {story.authorRole || 'user'}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderPoints = () => {
        if (!user) {
            return (
                <div className="main-content fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                    <div className="glass-panel" style={{ width: 'min(100%, 420px)', textAlign: 'center', padding: '2.5rem' }}>
                        <Coins size={48} className="text-accent" style={{ margin: '0 auto 1rem' }} />
                        <h1 className="title-font" style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>로그인이 필요합니다</h1>
                        <p className="text-muted" style={{ lineHeight: 1.7 }}>
                            포인트 충전과 사용 내역은 로그인 후 확인할 수 있습니다.
                        </p>
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }} onClick={() => navigate('login')}>
                            로그인하기
                        </button>
                    </div>
                </div>
            );
        }

        const pointBalance = pointData?.pointBalance ?? user?.point_balance ?? 0;
        const chatCost = pointData?.chatCost ?? getChatCostForUser(user);
        const storyLimit = pointData?.storyLimit ?? getStoryLimitForUser(user);
        const storyCount = pointData?.storyCount ?? stories.length;
        const canCharge = Boolean(pointData?.canCharge ?? user?.phone_verified_at ?? user?.role === 'admin');
        const quickPackages = [100, 300, 500, 1000] as const;
        const transactions = pointData?.recentTransactions || [];
        return (
            <div className="main-content fade-in">
                <div className="admin-hero glass-panel" style={{ marginBottom: '1rem' }}>
                    <div>
                        <div className="admin-hero-title">
                            <Coins size={22} className="text-accent" />
                            <h1 className="title-font" style={{ fontSize: '1.6rem' }}>포인트 충전</h1>
                        </div>
                        <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                            대화와 관리에 필요한 포인트를 여기서 충전하고, 사용 내역도 함께 확인하세요.
                        </p>
                    </div>
                    <div className="admin-hero-actions">
                        <button className="btn btn-outline" onClick={() => navigate('home')}>
                            <ChevronLeft size={16} /> 내 작품
                        </button>
                        <button className="btn btn-primary" onClick={() => void loadPointData()} disabled={pointLoading}>
                            <RefreshCw size={16} /> 새로고침
                        </button>
                    </div>
                </div>

                {pointError && (
                    <div className="glass-panel" style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.08)', marginBottom: '1rem' }}>
                        <strong>포인트 정보를 불러오지 못했습니다</strong>
                        <p className="text-muted" style={{ marginTop: '0.35rem' }}>{pointError}</p>
                    </div>
                )}

                <div className="points-summary-grid">
                    <div className="glass-panel points-metric-card">
                        <span className="badge badge-gold">현재 포인트</span>
                        <strong>{formatPointAmount(pointBalance)}</strong>
                        <p className="text-muted">회원가입 시 {formatPointAmount(50)} 웰컴 포인트를 제공합니다.</p>
                    </div>
                    <div className="glass-panel points-metric-card">
                        <span className="badge badge-green">대화 비용</span>
                        <strong>{formatPointAmount(chatCost)}</strong>
                        <p className="text-muted">{user?.is_premium ? '프리미엄 회원 요금' : '일반 회원 요금'}</p>
                    </div>
                    <div className="glass-panel points-metric-card">
                        <span className="badge badge-green">이야기 보유</span>
                        <strong>{storyCount} / {storyLimit}</strong>
                        <p className="text-muted">{storyLimit - storyCount > 0 ? `추가로 ${storyLimit - storyCount}개 더 만들 수 있어요.` : '보유 개수 한도에 도달했습니다.'}</p>
                    </div>
                </div>

                {!canCharge && (
                    <div className="glass-panel" style={{ marginBottom: '1rem', borderColor: 'rgba(244, 180, 0, 0.35)', background: 'rgba(244, 180, 0, 0.06)' }}>
                        <strong>본인인증이 필요합니다</strong>
                        <p className="text-muted" style={{ marginTop: '0.35rem' }}>
                            포인트 충전은 휴대폰 본인인증 후에만 가능합니다. 마이페이지에서 인증을 먼저 완료해주세요.
                        </p>
                        <button className="btn btn-outline" style={{ marginTop: '0.9rem' }} onClick={() => navigate('profile')}>
                            마이페이지로 이동
                        </button>
                    </div>
                )}

                <div className="points-layout">
                    <div className="glass-panel points-panel">
                        <div className="section-title-row">
                            <h2 className="section-title">빠른 충전</h2>
                            <span className="section-limit">즉시 반영</span>
                        </div>
                        <div className="points-package-grid">
                            {quickPackages.map((amount) => (
                                <button
                                    key={amount}
                                    className={`points-package ${pointChargePreset === amount ? 'is-active' : ''}`}
                                    onClick={() => {
                                        setPointChargePreset(amount);
                                        setPointChargeAmount(amount);
                                    }}
                                >
                                    <strong>{formatPointAmount(amount)}</strong>
                                    <span>{amount >= 500 ? '가성비 좋은 충전' : amount >= 300 ? '추천' : '가볍게 충전'}</span>
                                </button>
                            ))}
                        </div>

                        <div className="input-group" style={{ marginTop: '1.2rem' }}>
                            <label>직접 입력</label>
                            <input
                                type="number"
                                min="50"
                                step="50"
                                className="input-control"
                                value={pointChargeAmount}
                                onChange={(e) => setPointChargeAmount(Math.max(50, Math.floor(Number(e.target.value) || 0)))}
                            />
                            <p className="input-help">최소 50포인트부터 충전할 수 있습니다.</p>
                        </div>

                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', justifyContent: 'center' }}
                            onClick={() => void chargePoints(pointChargeAmount, `포인트 충전 ${formatPointAmount(pointChargeAmount)}`)}
                            disabled={pointLoading || !canCharge}
                        >
                            <CreditCard size={16} /> {formatPointAmount(pointChargeAmount)} 충전하기
                        </button>

                        <div className="points-note glass-panel" style={{ marginTop: '1rem' }}>
                            <strong>대화 안내</strong>
                            <p className="text-muted" style={{ marginTop: '0.4rem', lineHeight: 1.6 }}>
                                대화를 시작하기 전 포인트가 부족하면 안내 팝업이 열리고, 충전 페이지로 바로 이동할 수 있습니다.
                            </p>
                        </div>
                    </div>

                    <div className="glass-panel points-panel">
                        <div className="section-title-row">
                            <h2 className="section-title">최근 내역</h2>
                            <span className="section-limit">{transactions.length}건</span>
                        </div>
                        {pointLoading && !pointData ? (
                            <div className="points-empty-state">
                                <p className="text-muted">포인트 정보를 불러오는 중입니다...</p>
                            </div>
                        ) : transactions.length === 0 ? (
                            <div className="points-empty-state">
                                <p className="text-muted">아직 포인트 내역이 없습니다.</p>
                            </div>
                        ) : (
                            <div className="points-ledger">
                                {transactions.map((tx) => {
                                    const amountLabel = tx.amount > 0 ? `+${formatPointAmount(tx.amount)}` : formatPointAmount(tx.amount);
                                    const isPositive = tx.amount > 0;
                                    return (
                                        <div key={tx.id} className="points-ledger-item">
                                            <div>
                                                <div className="points-ledger-head">
                                                    <strong>{formatPointTransactionTypeLabel(tx.transactionType)}</strong>
                                                    <span className={isPositive ? 'text-positive' : 'text-negative'}>{amountLabel}</span>
                                                </div>
                                                <p className="text-muted points-ledger-note">{tx.note || '세부 메모 없음'}</p>
                                            </div>
                                            <div className="points-ledger-meta">
                                                <span>{formatKoreanDateTime(tx.createdAt)}</span>
                                                <span>잔액 {formatPointAmount(tx.balanceAfter)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderBinding = () => {
        if (!user) {
            return (
                <div className="main-content fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                    <div className="glass-panel" style={{ width: 'min(100%, 420px)', textAlign: 'center', padding: '2.5rem' }}>
                        <ScrollText size={48} className="text-accent" style={{ margin: '0 auto 1rem' }} />
                        <h1 className="title-font" style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>로그인이 필요합니다</h1>
                        <p className="text-muted" style={{ lineHeight: 1.7 }}>
                            제본용 출력은 로그인 후 이용할 수 있습니다.
                        </p>
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }} onClick={() => navigate('login')}>
                            로그인하기
                        </button>
                    </div>
                </div>
            );
        }

        const preview = bindingPreview;
        const bindingMessages = storyMessages.length ? storyMessages : (preview?.messages || storyMessages);
        const bindingViewerSettings = DEFAULT_BINDING_VIEWER_SETTINGS;
        const bindingFontSize = bindingViewerSettings.fontSize || DEFAULT_BINDING_VIEWER_SETTINGS.fontSize || readerSettings.fontSize;
        const bindingLineHeight = bindingViewerSettings.lineHeight || DEFAULT_BINDING_VIEWER_SETTINGS.lineHeight || readerSettings.lineHeight;
        const bindingFontFamily = bindingViewerSettings.fontFamily || DEFAULT_BINDING_VIEWER_SETTINGS.fontFamily || readerSettings.fontFamily;
        const bindingPreviewOptions = preview?.options || bindingOptions;
        const bindingPages: BindingPage[] = buildBindingPages({
            title: preview?.title || activeStory?.title || '',
            background: preview?.background || activeStory?.background || '',
            environment: preview?.environment || activeStory?.environment || '',
            messages: bindingMessages,
            viewerSettings: bindingViewerSettings,
            options: bindingPreviewOptions,
        }) as BindingPage[];
        const bindingPageCount = bindingPages.length || estimateBindingPageCount({
            title: preview?.title || activeStory?.title || '',
            background: preview?.background || activeStory?.background || '',
            environment: preview?.environment || activeStory?.environment || '',
            messages: bindingMessages,
            viewerSettings: bindingViewerSettings,
            options: bindingPreviewOptions,
        });
        const bindingCost = preview?.cost || bindingPageCount;
        const remainingPoints = preview?.remainingPoints ?? (pointData?.pointBalance ?? user?.point_balance ?? 0);
        const bindingFixedTypeSpec = `${bindingFontFamily} · ${bindingFontSize.toFixed(0)}px`;

        const renderBindingCover = () => {
            const coverImage = preview?.coverImageUrl || activeStory?.cover_image_url || null;
            const title = preview?.title || activeStory?.title || '제본 미리보기';
            const background = preview?.background || activeStory?.background || '배경 미설정';
            const authorName = preview?.authorName || user?.name || '작성자 미상';
            const createdAt = preview?.createdAt || activeStory?.created_at || '';

            return (
                <div className="binding-cover-layout">
                    <div
                        className={`binding-cover-art ${coverImage ? '' : 'is-placeholder'}`}
                        style={{
                            backgroundImage: coverImage
                                ? `linear-gradient(180deg, rgba(10,10,14,0.18), rgba(10,10,14,0.55)), url(${coverImage})`
                                : 'linear-gradient(180deg, #473a29 0%, #231b13 100%)',
                        }}
                    >
                        {!coverImage && <span className="binding-cover-placeholder">표지 없음</span>}
                        <div className="binding-cover-overlay">
                            <span className="badge badge-gold">A5 제본 표지</span>
                            <h2 className="binding-cover-title">{title}</h2>
                            <p className="binding-cover-author">{authorName}</p>
                        </div>
                    </div>

                    <div className="binding-cover-meta">
                        <div className="binding-cover-meta-grid">
                            <div>
                                <span>총 페이지</span>
                                <strong>{bindingPageCount}장</strong>
                            </div>
                            <div>
                                <span>예상 차감</span>
                                <strong>{formatPointAmount(bindingCost)}</strong>
                            </div>
                            <div>
                                <span>형식</span>
                                <strong>A5</strong>
                            </div>
                            <div>
                                <span>기준</span>
                                <strong>표지 포함</strong>
                            </div>
                        </div>
                        <div className="binding-cover-note">
                            <strong>{background}</strong>
                            <p>{createdAt ? `${formatKoreanDateTime(createdAt)}에 생성된 이야기입니다.` : '생성일 정보가 없습니다.'}</p>
                        </div>
                    </div>
                    <div className="binding-print-page-number">{1}</div>
                </div>
            );
        };

        const renderBindingContentPage = (page: BindingPage, config: { badge: string; title: string; detailLabel: string; bodyClass?: string; compact?: boolean; }) => {
            const isCompact = Boolean(config.compact);
            return (
                <div className={`binding-body-layout ${config.bodyClass || ''} ${isCompact ? 'is-compact' : ''}`}>
                    {!isCompact && (
                        <div className="binding-sheet-head">
                            <div>
                                <span className={`badge ${config.badge}`}>{config.title}</span>
                                <h3 className="binding-page-title">{preview?.title || activeStory?.title || '제본 미리보기'}</h3>
                            </div>
                            <div className="binding-sheet-meta">
                                <span>페이지 {page.number} / {bindingPageCount}</span>
                                <span>A5 · {config.detailLabel}</span>
                            </div>
                        </div>
                    )}

                    <div
                        className={`binding-manuscript ${isCompact ? 'binding-manuscript-book' : ''}`}
                        onContextMenu={(e) => e.preventDefault()}
                        onCopy={(e) => e.preventDefault()}
                        onDragStart={(e) => e.preventDefault()}
                    >
                        {page.blocks.length === 0 ? (
                            <div className="binding-empty-state">
                                본문 내용이 없습니다.
                            </div>
                        ) : (
                            page.blocks.map((block) => (
                                <div key={block.id} className={`binding-message binding-message-${block.role}`}>
                                    <span>{block.content}</span>
                                </div>
                            ))
                        )}
                    </div>

                    {!isCompact && (
                        <div className="binding-page-footer">
                            <span>{config.detailLabel}</span>
                            <span>{page.number} / {bindingPageCount}</span>
                        </div>
                    )}
                    <div className="binding-print-page-number">{page.number}</div>
                </div>
            );
        };

        const renderBindingPageByKind = (page: BindingPage) => {
            if (page.kind === 'cover') {
                return renderBindingCover();
            }

            if (page.kind === 'author_note') {
                return renderBindingContentPage(page, {
                    badge: 'badge-gold',
                    title: '작가의 말',
                    detailLabel: '작가의 말',
                    bodyClass: 'is-frontmatter',
                });
            }

            return renderBindingContentPage(page, {
                badge: 'badge-green',
                title: '본문',
                detailLabel: '본문',
                compact: true,
            });
        };

        const getBindingPageCaption = (page: BindingPage) => {
            if (page.kind === 'cover') return '표지';
            if (page.kind === 'author_note') return '작가의 말';
            return `${page.number} / ${bindingPageCount}`;
        };

        return (
            <div className="main-content fade-in binding-shell">
                <div className="glass-panel binding-toolbar">
                    <div className="binding-toolbar-copy">
                        <div className="admin-hero-title">
                        <ScrollText size={22} className="text-accent" />
                            <h1 className="title-font" style={{ fontSize: '1.6rem' }}>A5 제본 미리보기</h1>
                        </div>
                        <p className="text-muted" style={{ marginTop: '0.4rem', lineHeight: 1.6 }}>
                            선택한 총 {bindingPageCount}장 · 예상 차감 {formatPointAmount(bindingCost)} · 현재 잔액 {formatPointAmount(remainingPoints)}
                        </p>
                        <div className="binding-toolbar-note">
                            <span className="badge badge-gold">고정 설정</span>
                            <p>
                                제본용 출력은 <strong>{bindingFixedTypeSpec}</strong>로 고정됩니다. 화면 설정과 무관하게 책 출력에 맞는 형식으로만 나갑니다.
                            </p>
                        </div>
                    </div>
                    <div className="binding-toolbar-actions">
                        <button className="btn btn-outline" onClick={() => navigate('chat')}>
                            <ChevronLeft size={16} /> 읽기 화면
                        </button>
                        <button className="btn btn-primary" onClick={handleBindingPrint} disabled={bindingMessages.length === 0 || bindingPageCount === 0}>
                            <ScrollText size={16} /> 제본하기
                        </button>
                    </div>
                </div>

                <div className="binding-grid">
                    <div className="binding-pages-list">
                        {bindingPages.map((page, index) => (
                            <div key={page.number} className="binding-page-shell">
                                <div
                                    ref={index === 0 ? bindingPrintRef : undefined}
                                    className={`binding-sheet ${page.kind === 'cover' ? 'is-cover' : ''}`}
                                    style={{
                                        fontFamily: bindingFontFamily,
                                        fontSize: `${bindingFontSize}px`,
                                        lineHeight: bindingLineHeight,
                                    }}
                                >
                                    {renderBindingPageByKind(page)}
                                </div>
                                <div className="binding-page-caption">{getBindingPageCaption(page)} · {page.number} / {bindingPageCount}</div>
                            </div>
                        ))}
                    </div>

                    <div className="binding-sidebar">
                        <div className="glass-panel binding-info-card">
                            <span className="badge badge-green">결제 요약</span>
                            <div className="binding-stat-grid">
                                <div>
                                    <span>선택한 총 페이지</span>
                                    <strong>{bindingPageCount}장</strong>
                                </div>
                                <div>
                                    <span>예상 차감</span>
                                    <strong>{formatPointAmount(bindingCost)}</strong>
                                </div>
                                <div>
                                    <span>현재 잔액</span>
                                    <strong>{formatPointAmount(remainingPoints)}</strong>
                                </div>
                                <div>
                                    <span>제본 형식</span>
                                    <strong>A5</strong>
                                </div>
                            </div>
                            <p className="text-muted" style={{ marginTop: '0.9rem', lineHeight: 1.6 }}>
                                제본 차감은 선택한 표지, 작가의 말, 본문을 모두 합한 총 페이지당 1포인트로 처리됩니다. 인쇄 전에는 내용을 다시 확인해 주세요.
                            </p>
                        </div>

                        <div className="glass-panel binding-note-card">
                            <strong>안내</strong>
                            <p className="text-muted" style={{ marginTop: '0.45rem', lineHeight: 1.6 }}>
                                이 화면은 제본용 출력 전용입니다. 브라우저 인쇄 기능을 사용하면 A5 크기로 저장할 수 있고, 표지와 본문이 페이지 단위로 분리됩니다.
                            </p>
                            <button className="btn btn-outline" style={{ width: '100%', marginTop: '0.9rem' }} onClick={() => navigate('points')}>
                                포인트 충전
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderProfile = () => {
        if (!user) {
            return (
                <div className="main-content fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                    <div className="glass-panel" style={{ width: 'min(100%, 420px)', textAlign: 'center', padding: '2.5rem' }}>
                        <Users size={48} className="text-accent" style={{ margin: '0 auto 1rem' }} />
                        <h1 className="title-font" style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>로그인이 필요합니다</h1>
                        <p className="text-muted" style={{ lineHeight: 1.7 }}>
                            마이페이지에서는 본인인증과 성인인증을 진행할 수 있습니다.
                        </p>
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }} onClick={() => navigate('login')}>
                            로그인하기
                        </button>
                    </div>
                </div>
            );
        }

        const identityVerified = Boolean(pointData?.identityVerified ?? user.phone_verified_at);
        const adultVerified = Boolean(pointData?.adultVerified ?? user.is_adult);

        return (
            <div className="main-content fade-in">
                <div className="admin-hero glass-panel" style={{ marginBottom: '1rem' }}>
                    <div>
                        <div className="admin-hero-title">
                            <Users size={22} className="text-accent" />
                            <h1 className="title-font" style={{ fontSize: '1.6rem' }}>마이페이지</h1>
                        </div>
                        <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                            계정 정보, 본인인증, 성인인증 상태를 한 곳에서 관리하세요.
                        </p>
                    </div>
                    <div className="admin-hero-actions">
                        <button className="btn btn-outline" onClick={() => navigate('home')}>
                            <ChevronLeft size={16} /> 홈으로
                        </button>
                        <button className="btn btn-primary" onClick={() => navigate('points')}>
                            <Coins size={16} /> 포인트
                        </button>
                    </div>
                </div>

                {profileActionMessage && (
                    <div className="glass-panel" style={{ marginBottom: '1rem', borderColor: 'rgba(244, 180, 0, 0.35)' }}>
                        <strong>안내</strong>
                        <p className="text-muted" style={{ marginTop: '0.35rem' }}>{profileActionMessage}</p>
                    </div>
                )}

                <div className="profile-summary-grid">
                    <div className="glass-panel profile-summary-card">
                        <span className="badge badge-gold">기본 정보</span>
                        <h2 className="title-font" style={{ marginTop: '0.75rem', fontSize: '1.4rem' }}>{user.name}</h2>
                        <p className="text-muted">{user.email || '이메일 없음'}</p>
                        <div className="profile-badge-row">
                            <span className={`badge ${user.role === 'admin' ? 'badge-red' : 'badge-green'}`}>{user.role}</span>
                            <span className="badge badge-green">{user.provider || 'local'}</span>
                            <span className={`badge ${identityVerified ? 'badge-green' : 'badge-red'}`}>{identityVerified ? '본인인증 완료' : '본인인증 필요'}</span>
                            <span className={`badge ${adultVerified ? 'badge-green' : 'badge-red'}`}>{adultVerified ? '성인인증 완료' : '성인인증 필요'}</span>
                        </div>
                        <div className="profile-meta-list">
                            <div><span>휴대폰</span><strong>{user.phone_number || '미등록'}</strong></div>
                            <div><span>가입 포인트</span><strong>{formatPointAmount(pointData?.pointBalance ?? user.point_balance)}</strong></div>
                            <div><span>대화 비용</span><strong>{formatPointAmount(pointData?.chatCost ?? getChatCostForUser(user))}</strong></div>
                            <div><span>이야기 한도</span><strong>{pointData?.storyCount ?? stories.length} / {pointData?.storyLimit ?? getStoryLimitForUser(user)}</strong></div>
                        </div>
                    </div>

                    <div className="glass-panel profile-summary-card">
                        <span className="badge badge-green">본인인증</span>
                        <h3 className="section-title" style={{ marginTop: '0.75rem' }}>포인트 충전 전 확인</h3>
                        <p className="text-muted">휴대폰 인증을 해야 포인트 충전이 열립니다.</p>

                        <div className="input-group">
                            <label>휴대폰 번호</label>
                            <input
                                className="input-control"
                                value={profilePhoneNumber}
                                onChange={(e) => setProfilePhoneNumber(e.target.value)}
                                placeholder={user.phone_number || '01012345678'}
                                disabled={identityVerified}
                            />
                        </div>

                        <div className="inline-actions">
                            <button className="btn btn-outline" type="button" onClick={() => void handleProfilePhoneRequest()} disabled={profilePhoneSending || identityVerified}>
                                {profilePhoneSending ? '전송 중...' : identityVerified ? '완료됨' : '인증번호 받기'}
                            </button>
                            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                                {identityVerified ? '이미 본인인증이 완료되었습니다.' : '문자 인증 후 포인트 충전이 가능합니다.'}
                            </span>
                        </div>

                        <div className="input-group">
                            <label>인증번호</label>
                            <input
                                className="input-control"
                                value={profilePhoneCode}
                                onChange={(e) => setProfilePhoneCode(e.target.value)}
                                placeholder="6자리 숫자"
                                disabled={identityVerified}
                            />
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void handleProfilePhoneVerify()} disabled={profilePhoneVerifying || identityVerified || !profilePhoneRequestId}>
                            {profilePhoneVerifying ? '확인 중...' : identityVerified ? '본인인증 완료' : '번호 확인'}
                        </button>
                    </div>

                    <div className="glass-panel profile-summary-card">
                        <span className="badge badge-gold">성인인증</span>
                        <h3 className="section-title" style={{ marginTop: '0.75rem' }}>마이페이지에서 설정</h3>
                        <p className="text-muted">성인 여부는 생년월일과 휴대폰 인증을 함께 확인합니다.</p>

                        <div className="input-group">
                            <label>생년월일</label>
                            <input
                                className="input-control"
                                type="date"
                                value={profileAdultBirthDate}
                                onChange={(e) => setProfileAdultBirthDate(e.target.value)}
                                disabled={adultVerified}
                            />
                        </div>

                        <div className="input-group">
                            <label>휴대폰 번호</label>
                            <input
                                className="input-control"
                                value={profileAdultPhoneNumber}
                                onChange={(e) => setProfileAdultPhoneNumber(e.target.value)}
                                placeholder={user.phone_number || '01012345678'}
                                disabled={adultVerified}
                            />
                        </div>

                        <div className="inline-actions">
                            <button className="btn btn-outline" type="button" onClick={() => void handleProfileAdultRequest()} disabled={profileAdultSending || adultVerified}>
                                {profileAdultSending ? '전송 중...' : adultVerified ? '완료됨' : '성인인증번호 받기'}
                            </button>
                            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                                {adultVerified ? '성인인증이 완료되었습니다.' : '인증 후 성인 콘텐츠 공개 플래그가 활성화됩니다.'}
                            </span>
                        </div>

                        <div className="input-group">
                            <label>인증번호</label>
                            <input
                                className="input-control"
                                value={profileAdultCode}
                                onChange={(e) => setProfileAdultCode(e.target.value)}
                                placeholder="6자리 숫자"
                                disabled={adultVerified}
                            />
                        </div>

                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void handleProfileAdultVerify()} disabled={profileAdultVerifying || adultVerified || !profileAdultRequestId}>
                            {profileAdultVerifying ? '확인 중...' : adultVerified ? '성인인증 완료' : '성인 인증 완료'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ── Studio: story & character creation/edit ──────────────────────
    const renderStudio = () => {
        if (!user) {
            return (
                <div className="main-content fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                    <div className="glass-panel" style={{ width: 'min(100%, 420px)', textAlign: 'center', padding: '2.5rem' }}>
                        <BookOpen size={48} className="text-accent" style={{ margin: '0 auto 1rem' }} />
                        <h1 className="title-font" style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>로그인이 필요합니다</h1>
                        <p className="text-muted" style={{ lineHeight: 1.7 }}>
                            이야기를 만들고 주인공을 설정하려면 먼저 로그인해주세요.
                        </p>
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }} onClick={() => navigate('login')}>
                            로그인하기
                        </button>
                    </div>
                </div>
            );
        }

        type CharacterMultiField = 'personality' | 'speechStyles' | 'behaviorRules' | 'likes' | 'dislikes' | 'goals';
        type CharacterTextField = 'customBehaviorRules' | 'customDislikes' | 'customGoals' | 'background';

        const handleAddCharacter = () => {
            if (form.characters && form.characters.length >= MAX_CHARACTERS) {
                alert(`등장인물은 최대 ${MAX_CHARACTERS}명까지만 가능합니다.`);
                return;
            }
            setForm(prev => ({
                ...prev,
                characters: [...(prev.characters || []), createEmptyCharacter()]
            }));
        };

        const handleRemoveCharacter = (index: number) => {
            setForm(prev => ({
                ...prev,
                characters: (prev.characters || []).filter((_, i) => i !== index)
            }));
        };

        const handleSetProtagonist = (index: number) => {
            setForm((prev) => {
                const nextCharacters = (prev.characters || []).map((char, currentIndex) => ({
                    ...char,
                    isProtagonist: currentIndex === index ? !char.isProtagonist : false,
                }));
                return { ...prev, characters: nextCharacters };
            });
        };

        const handleCharChange = <K extends keyof StoryCharacter>(index: number, field: K, value: StoryCharacter[K]) => {
            setForm(prev => {
                const newChars = [...(prev.characters || [])];
                newChars[index] = { ...newChars[index], [field]: value };
                return { ...prev, characters: newChars };
            });
        };

        const toggleCharacterSelection = (
            index: number,
            field: CharacterMultiField,
            value: string,
            maxSelections: number,
            label: string
        ) => {
            const currentValues = (form.characters?.[index]?.[field] as string[]) || [];
            const alreadySelected = currentValues.includes(value);

            if (!alreadySelected && currentValues.length >= maxSelections) {
                alert(`${label}은(는) 최대 ${maxSelections}개까지 선택할 수 있습니다.`);
                return;
            }

            const nextValues = alreadySelected
                ? currentValues.filter((item) => item !== value)
                : [...currentValues, value];

            handleCharChange(index, field, nextValues as StoryCharacter[typeof field]);
        };

        const handleLongTextChange = (index: number, field: CharacterTextField, value: string) => {
            handleCharChange(index, field, limitLongText(value) as StoryCharacter[typeof field]);
        };

        const renderChoiceGroup = (
            characterIndex: number,
            field: CharacterMultiField,
            options: { label: string; value: string }[],
            maxSelections: number,
            limitLabel: string
        ) => {
            const selectedValues = (form.characters?.[characterIndex]?.[field] as string[]) || [];

            return (
                <div className="selection-grid">
                    {options.map((option) => {
                        const checked = selectedValues.includes(option.value);

                        return (
                            <label key={option.value} className={`choice-chip ${checked ? 'is-selected' : ''}`}>
                                <input
                                    type="checkbox"
                                    value={option.value}
                                    checked={checked}
                                    onChange={() => toggleCharacterSelection(characterIndex, field, option.value, maxSelections, limitLabel)}
                                />
                                <span>{option.label}</span>
                            </label>
                        );
                    })}
                </div>
            );
        };

        const renderSingleChoiceGroup = (
            characterIndex: number,
            field: 'gender' | 'relationship',
            options: { label: string; value: string }[]
        ) => {
            const selectedValue = (form.characters?.[characterIndex]?.[field] as string) || '';

            return (
                <div className="selection-grid">
                    {options.map((option) => (
                        <label key={option.value} className={`choice-chip ${selectedValue === option.value ? 'is-selected' : ''}`}>
                            <input
                                type="radio"
                                name={`${field}-${characterIndex}`}
                                value={option.value}
                                checked={selectedValue === option.value}
                                onChange={() => handleCharChange(characterIndex, field, option.value as StoryCharacter[typeof field])}
                            />
                            <span>{option.label}</span>
                        </label>
                    ))}
                </div>
            );
        };

        const renderLongTextCounter = (value: string) => (
            <div className="text-counter">{value.length} / {LONG_TEXT_LIMIT}</div>
        );

        const canEditCover = editMode === 'edit' && activeStory?.public_status === 'approved';
        const canDirectPublish = canUseDirectPublish(user);
        const currentCoverImage = typeof form.cover_image_url === 'string' && form.cover_image_url
            ? form.cover_image_url
            : activeStory?.cover_image_url || '';

        const handleCoverUpload = async (file?: File | null) => {
            if (!file) return;
            if (!canEditCover) {
                alert('표지는 작품이 공개된 뒤에만 등록할 수 있습니다.');
                return;
            }

            try {
                const dataUrl = await createCoverImageDataUrl(file);
                setForm((prev) => ({ ...prev, cover_image_url: dataUrl }));
            } catch (err: unknown) {
                alert(getErrorMessage(err));
            }
        };

        return (
            <div className="main-content fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="btn btn-outline" onClick={() => navigate('home')}><ChevronLeft size={18} /></button>
                        <h1 className="title-font" style={{ fontSize: '1.5rem' }}>
                            {editMode === 'new' ? '새 이야기 만들기' : `${form.title || '이야기'} 설정`}
                        </h1>
                    </div>
                    <button className="btn btn-primary" onClick={saveStory}>
                        <Sparkles size={16} /> 저장
                    </button>
                </div>

                <div className="glass-panel home-limit-banner" style={{ marginBottom: '1rem' }}>
                    <div>
                        <strong>이야기 보유 한도</strong>
                        <p className="text-muted" style={{ marginTop: '0.35rem' }}>
                            일반 회원은 3개, 프리미엄 회원은 30개까지 무료로 이야기와 주인공을 만들 수 있습니다.
                        </p>
                    </div>
                    <span className={`badge ${stories.length >= getStoryLimitForUser(user) ? 'badge-red' : 'badge-green'}`}>
                        {stories.length} / {getStoryLimitForUser(user)}
                    </span>
                </div>

                <div className="studio-layout">
                    {/* 이야기 기본 설정 */}
                    <div className="glass-panel" style={{ alignSelf: 'start' }}>
                        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <BookOpen size={20} className="text-accent" /> 소설 세계관 설정
                        </h2>

                        <div className="input-group">
                            <label>이야기 제목 *</label>
                            <input className="input-control" placeholder="예: 용사와 마왕의 기묘한 동거" value={form.title}
                                onChange={e => setForm({ ...form, title: e.target.value })} />
                        </div>

                        <div className="input-group">
                            <label>전체 배경 / 세계관</label>
                            <textarea className="input-control" style={{ minHeight: 120 }}
                                placeholder="예: 마법과 과학이 공존하는 이세계. 800년 전 마왕이 부활해 전쟁 중. 주인공은 마왕을 물리치러 온 이세계 용사다."
                                value={form.background} onChange={e => setForm({ ...form, background: e.target.value })} />
                        </div>

                        <div className="input-group">
                            <label>현재 주변 환경 / 상황 (시작점)</label>
                            <textarea className="input-control" style={{ minHeight: 100 }}
                                placeholder="예: 마왕성의 낡은 주방. 비가 내리고 있으며 음산한 기운이 감돈다."
                                value={form.environment} onChange={e => setForm({ ...form, environment: e.target.value })} />
                        </div>

                        <div className="input-group" style={{ marginBottom: 0 }}>
                            <label>공개 방식</label>
                            <select
                                className="input-control"
                                value={form.public_method || 'private'}
                                onChange={(e) => {
                                    const next = e.target.value as StoryPublicMethod;
                                    if (next === 'direct' && !canDirectPublish) return;
                                    setForm({
                                        ...form,
                                        public_method: next,
                                        is_public: next === 'approved' || next === 'direct',
                                    });
                                }}
                            >
                                <option value="private">비공개</option>
                                <option value="request">관리자 승인 요청</option>
                                <option value="direct" disabled={!canDirectPublish}>
                                    즉시 커뮤니티 공개{canDirectPublish ? '' : ' (권한 필요)'}
                                </option>
                                {editMode === 'edit' && activeStory?.public_status === 'approved' && (
                                    <option value="approved">승인 공개 유지</option>
                                )}
                            </select>
                            <p className="input-help" style={{ marginTop: '0.45rem' }}>
                                승인 요청은 관리자 검토 후 커뮤니티에 노출됩니다. 권한이 있으면 즉시 공개도 선택할 수 있습니다.
                            </p>
                        </div>

                        <div className="input-group" style={{ marginTop: '1rem', marginBottom: 0 }}>
                            <label>표지 이미지</label>
                            <div className="story-cover-panel">
                                <div
                                    className={`story-cover-preview ${canEditCover ? '' : 'is-disabled'}`}
                                    style={{ backgroundImage: currentCoverImage ? `url(${currentCoverImage})` : 'linear-gradient(180deg, #f7efe2 0%, #e7d7bc 100%)' }}
                                >
                                    {!currentCoverImage && (
                                        <span>{canEditCover ? '표지를 업로드해주세요' : '공개 후 등록 가능'}</span>
                                    )}
                                </div>
                                <div className="story-cover-actions">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        disabled={!canEditCover}
                                        onChange={(e) => {
                                            void handleCoverUpload(e.target.files?.[0] || null);
                                            e.currentTarget.value = '';
                                        }}
                                    />
                                    <div className="story-cover-note">
                                        <p>권장 크기: 800 × 1200</p>
                                        <p>최대 용량: 5MB, 자동으로 세로 표지 비율로 맞춥니다.</p>
                                    </div>
                                    <button
                                        className="btn btn-outline"
                                        type="button"
                                        disabled={!canEditCover || !currentCoverImage}
                                        onClick={() => setForm((prev) => ({ ...prev, cover_image_url: '' }))}
                                    >
                                        표지 삭제
                                    </button>
                                </div>
                            </div>
                            {!canEditCover && (
                                <p className="input-help" style={{ marginTop: '0.5rem' }}>
                                    표지는 작품이 공개된 뒤에만 추가할 수 있습니다.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* 등장인물 설정 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Users size={20} className="text-accent" /> 등장인물 ({(form.characters || []).length}/{MAX_CHARACTERS})
                            </h2>
                            <button className="btn btn-outline" onClick={handleAddCharacter} disabled={(form.characters || []).length >= MAX_CHARACTERS}>
                                <Plus size={16} /> 인물 추가
                            </button>
                        </div>

                        {(form.characters || []).length === 0 ? (
                            <div className="glass-panel" style={{ textAlign: 'center', padding: '2rem' }}>
                                <p className="text-muted">이야기에 등장할 인물을 추가해주세요.</p>
                            </div>
                        ) : (
                            (form.characters || []).map((char, index) => (
                                <div key={index} className="glass-panel character-editor" style={{ position: 'relative' }}>
                                    <button
                                        onClick={() => handleRemoveCharacter(index)}
                                        style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>
                                        <Trash2 size={18} />
                                    </button>
                                    <div className="character-head-row">
                                        <h3 style={{ marginBottom: 0, fontSize: '1rem', color: 'var(--accent)' }}>등장인물 {index + 1}</h3>
                                        <button
                                            type="button"
                                            className={`btn btn-outline character-protagonist-btn ${char.isProtagonist ? 'is-active' : ''}`}
                                            onClick={() => handleSetProtagonist(index)}
                                        >
                                            {char.isProtagonist ? '주인공' : '주인공으로 지정'}
                                        </button>
                                    </div>
                                    {char.isProtagonist && <span className="badge badge-gold character-protagonist-badge">주인공</span>}

                                    <div className="character-section">
                                        <h4 className="section-title">기본</h4>
                                        <div className="field-grid field-grid-two">
                                            <div className="input-group">
                                                <label>이름 *</label>
                                                <input
                                                    className="input-control"
                                                    placeholder="예: 루미아"
                                                    value={char.name}
                                                    onChange={e => handleCharChange(index, 'name', e.target.value)}
                                                />
                                            </div>
                                            <div className="input-group">
                                                <label>나이</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="input-control"
                                                    placeholder="예: 27"
                                                    value={char.age}
                                                    onChange={e => handleCharChange(index, 'age', e.target.value === '' ? '' : Number(e.target.value))}
                                                />
                                            </div>
                                        </div>

                                        <div className="input-group">
                                            <label>성별</label>
                                            {renderSingleChoiceGroup(index, 'gender', GENDER_OPTIONS)}
                                        </div>

                                        <div className="field-grid field-grid-two">
                                            <div className="input-group">
                                                <label>직업</label>
                                                <input
                                                    className="input-control"
                                                    placeholder="예: 게임 스트리머"
                                                    value={char.job}
                                                    onChange={e => handleCharChange(index, 'job', e.target.value)}
                                                />
                                            </div>
                                            <div className="input-group">
                                                <label>거주지</label>
                                                <input
                                                    className="input-control"
                                                    placeholder="예: 서울 마포구"
                                                    value={char.residence}
                                                    onChange={e => handleCharChange(index, 'residence', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="character-section">
                                        <div className="section-title-row">
                                            <h4 className="section-title">성향</h4>
                                            <span className="section-limit">최대 {PERSONALITY_LIMIT}개 선택</span>
                                        </div>
                                        {renderChoiceGroup(index, 'personality', PERSONALITY_OPTIONS, PERSONALITY_LIMIT, '성향')}
                                    </div>

                                    <div className="character-section">
                                        <div className="section-title-row">
                                            <h4 className="section-title">말투</h4>
                                            <span className="section-limit">최대 {SPEECH_STYLE_LIMIT}개 선택</span>
                                        </div>
                                        {renderChoiceGroup(index, 'speechStyles', SPEECH_STYLE_OPTIONS, SPEECH_STYLE_LIMIT, '말투')}
                                    </div>

                                    <div className="character-section">
                                        <h4 className="section-title">행동</h4>
                                        <div className="input-group">
                                            {renderChoiceGroup(index, 'behaviorRules', BEHAVIOR_RULE_OPTIONS, BEHAVIOR_RULE_OPTIONS.length, '행동')}
                                        </div>
                                        <div className="input-group" style={{ marginBottom: 0 }}>
                                            <label>메모</label>
                                            <textarea
                                                className="input-control"
                                                maxLength={LONG_TEXT_LIMIT}
                                                placeholder="예: 힘들어 보이면 먼저 안부를 묻는다."
                                                value={char.customBehaviorRules}
                                                onChange={e => handleLongTextChange(index, 'customBehaviorRules', e.target.value)}
                                            />
                                            {renderLongTextCounter(char.customBehaviorRules)}
                                        </div>
                                    </div>

                                    <div className="character-section">
                                        <div className="section-title-row">
                                            <h4 className="section-title">좋아함</h4>
                                            <span className="section-limit">최대 {LIKES_LIMIT}개 선택</span>
                                        </div>
                                        {renderChoiceGroup(index, 'likes', LIKE_OPTIONS, LIKES_LIMIT, '좋아함')}
                                    </div>

                                    <div className="character-section">
                                        <h4 className="section-title">싫어함</h4>
                                        <div className="input-group">
                                            {renderChoiceGroup(index, 'dislikes', DISLIKE_OPTIONS, DISLIKE_OPTIONS.length, '싫어함')}
                                        </div>
                                        <div className="input-group" style={{ marginBottom: 0 }}>
                                            <label>메모</label>
                                            <textarea
                                                className="input-control"
                                                maxLength={LONG_TEXT_LIMIT}
                                                placeholder="예: 무시당하는 상황, 예의 없는 농담"
                                                value={char.customDislikes}
                                                onChange={e => handleLongTextChange(index, 'customDislikes', e.target.value)}
                                            />
                                            {renderLongTextCounter(char.customDislikes)}
                                        </div>
                                    </div>

                                    <div className="character-section">
                                        <h4 className="section-title">이야기 속 역할</h4>
                                        {renderSingleChoiceGroup(index, 'relationship', RELATIONSHIP_OPTIONS)}
                                    </div>

                                    <div className="character-section">
                                        <h4 className="section-title">목표</h4>
                                        <div className="input-group">
                                            {renderChoiceGroup(index, 'goals', GOAL_OPTIONS, GOAL_OPTIONS.length, '목표')}
                                        </div>
                                        <div className="input-group" style={{ marginBottom: 0 }}>
                                            <label>메모</label>
                                            <textarea
                                                className="input-control"
                                                maxLength={LONG_TEXT_LIMIT}
                                                placeholder="예: 위기에 놓이면 옆에서 힘이 되어준다."
                                                value={char.customGoals}
                                                onChange={e => handleLongTextChange(index, 'customGoals', e.target.value)}
                                            />
                                            {renderLongTextCounter(char.customGoals)}
                                        </div>
                                    </div>

                                    <div className="character-section" style={{ marginBottom: 0 }}>
                                        <h4 className="section-title">개요</h4>
                                        <div className="input-group" style={{ marginBottom: 0 }}>
                                            <label>메모</label>
                                            <textarea
                                                className="input-control"
                                                maxLength={LONG_TEXT_LIMIT}
                                                placeholder={'예)\n게임 스트리머로 활동하며\n인물들과 자연스럽게 어울린다.'}
                                                value={char.background}
                                                onChange={e => handleLongTextChange(index, 'background', e.target.value)}
                                            />
                                            <p className="input-help">예) 게임 스트리머로 활동하며 인물들과 자연스럽게 어울린다.</p>
                                            {renderLongTextCounter(char.background)}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ── Story Writer view ─────────────────────────────────────────
    const renderChat = () => {
        if (!user) {
            return (
                <div className="main-content fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                    <div className="glass-panel" style={{ width: 'min(100%, 420px)', textAlign: 'center', padding: '2.5rem' }}>
                        <MessageSquareText size={48} className="text-accent" style={{ margin: '0 auto 1rem' }} />
                        <h1 className="title-font" style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>로그인이 필요합니다</h1>
                        <p className="text-muted" style={{ lineHeight: 1.7 }}>
                            대화와 집필은 로그인 후 이용할 수 있습니다.
                        </p>
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }} onClick={() => navigate('login')}>
                            로그인하기
                        </button>
                    </div>
                </div>
            );
        }

        const userColorStr = `rgb(${readerSettings.userColorR}, ${readerSettings.userColorG}, ${readerSettings.userColorB})`;
        const aiColorStr = `rgb(${readerSettings.aiColorR}, ${readerSettings.aiColorG}, ${readerSettings.aiColorB})`;
        const visibleStoryMessages = readerSettings.hideUserText
            ? storyMessages.filter(msg => msg.role !== 'user')
            : storyMessages;

        const renderMessageContent = (content: string) => {
            let htmlContent = escapeHtml(content).replace(/\n/g, '<br />');
            if (activeStory?.characters) {
                // 이름이 긴 순서대로 정렬하여 부분 일치 방지
                const sortedChars = [...activeStory.characters]
                    .filter(c => c.name && c.name.trim())
                    .sort((a, b) => b.name.length - a.name.length);
                sortedChars.forEach(char => {
                    const escapedName = escapeHtml(char.name.trim());
                    const regex = new RegExp(`(${escapeRegExp(escapedName)})`, 'g');
                    htmlContent = htmlContent.replace(regex, '<span class="character-name-highlight">$1</span>');
                });
        }
        return <span style={{ color: aiColorStr, transition: 'color 0.2s' }} dangerouslySetInnerHTML={{ __html: htmlContent }}></span>;
        };

        const blockReaderProtection = (event: { preventDefault: () => void; target: EventTarget | null }) => {
            const target = event.target as HTMLElement | null;
            if (target && target.closest('textarea, input, button, a, select, option, [contenteditable="true"]')) {
                return;
            }
            event.preventDefault();
        };

        const bindingQuoteEstimatedPages = estimateBindingPageCount({
            title: activeStory?.title || '',
            background: activeStory?.background || '',
            environment: activeStory?.environment || '',
            messages: storyMessages,
            viewerSettings: readerSettings,
            options: bindingOptions,
        });
        const bindingQuotePreviewOptions = bindingPreview?.options || bindingOptions;
        const bindingQuoteAuthorNoteLimit = Math.max(300, Math.min(1200, Math.floor(getBindingBodyBudget(DEFAULT_BINDING_VIEWER_SETTINGS) * 0.7)));
        const bindingQuoteCost = bindingPreview?.cost ?? bindingQuoteEstimatedPages;
        const bindingQuoteBalance = pointData?.pointBalance ?? user?.point_balance ?? 0;
        const bindingQuoteRemaining = bindingQuoteBalance - bindingQuoteCost;

        const setStoryMessageRef = (messageId: number) => (node: HTMLDivElement | null) => {
            if (node) {
                storyMessageRefs.current[messageId] = node;
            } else {
                delete storyMessageRefs.current[messageId];
            }
        };

        const renderReaderMessage = (msg: StoryMessage) => {
            const isEditable = canEditStoryMessage(msg);
            const isEditing = editingMessageId === msg.id;

            if (msg.role === 'user') {
                return (
                    <div key={msg.id} className="reader-message reader-message-user">
                        <span style={{ color: userColorStr, transition: 'color 0.2s', opacity: 0.8, fontSize: '0.9em' }}>
                            ➔ {msg.content}
                        </span>
                    </div>
                );
            }

            return (
                <div
                    key={msg.id}
                    ref={setStoryMessageRef(msg.id)}
                    className={`reader-message reader-message-assistant ${isEditable ? 'is-editable' : ''} ${isEditing ? 'is-editing' : ''}`}
                >
                    {!isEditing ? (
                        <>
                            {isEditable && (
                                <button
                                    type="button"
                                    className="reader-message-edit-trigger"
                                    onClick={() => beginEditStoryMessage(msg)}
                                    aria-label="AI 글 수정"
                                >
                                    수정
                                </button>
                            )}
                            <div className="reader-message-body">
                                {renderMessageContent(msg.content)}
                            </div>
                        </>
                    ) : (
                        <div className="reader-message-editor">
                            <textarea
                                ref={editingMessageTextareaRef}
                                className="reader-message-textarea input-control"
                                value={editingMessageDraft}
                                onChange={(e) => setEditingMessageDraft(e.target.value)}
                                disabled={editingMessageSaving}
                                style={{ color: aiColorStr }}
                                aria-label="AI 글 수정"
                            />
                            <div className="reader-message-editor-actions">
                                <button
                                    type="button"
                                    className="btn btn-outline reader-message-cancel-btn"
                                    onClick={cancelEditStoryMessage}
                                    disabled={editingMessageSaving}
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => void saveEditedStoryMessage()}
                                    disabled={editingMessageSaving}
                                >
                                    {editingMessageSaving ? '저장 중...' : '완료'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            );
        };

        return (
            <div className="chat-layout fade-in" style={{ height: 'calc(100dvh - 60px)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* Header */}
                <div className="chat-header glass-panel" style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border-color)' }}>
                    <div className="flex items-center gap-4">
                        <button className="btn-icon" onClick={() => navigate('home')}><ChevronLeft size={22} /></button>
                        <div className="font-bold flex items-center gap-2" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>
                            <BookOpen size={20} />
                            {activeStory?.title}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline" style={{ padding: '0.42rem 0.8rem', fontSize: '0.78rem' }} onClick={() => navigate('points')}>
                            <Coins size={14} /> 포인트 {formatPointAmount(pointData?.pointBalance ?? user?.point_balance ?? 0)}
                        </button>
                        <span className="badge badge-gold">대화 {formatPointAmount(pointData?.chatCost ?? getChatCostForUser(user))}</span>
                        <button
                            className="btn btn-outline"
                            style={{ padding: '0.42rem 0.8rem', fontSize: '0.78rem' }}
                            onClick={openBindingQuote}
                            disabled={!activeStory || storyMessages.length === 0}
                            title={!activeStory || storyMessages.length === 0 ? '이야기를 연 뒤 사용할 수 있습니다.' : '제본용 A5 출력'}
                        >
                            <ScrollText size={14} /> 제본용 출력
                        </button>
                        <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
                        <button className="btn-icon" onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}>
                            <Settings size={20} />
                        </button>
                        <button className="btn-icon" onClick={handleClearChat} title="초기화">
                            <RefreshCw size={18} />
                        </button>

                        {/* Settings Drawer (Restored) */}
                        {showSettingsDrawer && (
                            <div className="glass-panel" style={{
                                position: 'absolute', top: '50px', right: 0, width: '320px', zIndex: 100,
                                boxShadow: '0 10px 30px rgba(0,0,0,0.5)', padding: '1.5rem'
                            }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Settings size={18} /> 뷰어 설정
                                </h3>

                                <div className="input-group">
                                    <label>읽기 화면비</label>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        {(['full', 'wide', 'standard', 'tall'] as const).map(r => (
                                            <button key={r} className={`btn btn-outline ${readerSettings.aspectRatio === r ? 'active' : ''}`}
                                                style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', borderColor: readerSettings.aspectRatio === r ? 'var(--accent)' : '' }}
                                                onClick={() => setReaderSettings({ ...readerSettings, aspectRatio: r })}>
                                                {r === 'full' ? '전체화면' : r === 'wide' ? '와이드' : r === 'standard' ? '표준' : '세로집중'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label>글꼴</label>
                                    <select className="input-control" value={readerSettings.fontFamily} onChange={e => setReaderSettings({ ...readerSettings, fontFamily: e.target.value })} style={{ padding: '0.4rem' }}>
                                        <option value="Gowun Batang">고운 바탕</option>
                                        <option value="Noto Serif KR">본명조</option>
                                        <option value="Nanum Myeongjo">나눔 명조</option>
                                        <option value="Nanum Gothic">나눔 고딕</option>
                                        <option value="Inter">인터 (기본)</option>
                                    </select>
                                </div>

                                <div className="input-group">
                                    <label>글자 크기 ({readerSettings.fontSize}px)</label>
                                    <input type="range" min="14" max="32" value={readerSettings.fontSize}
                                        onChange={e => setReaderSettings({ ...readerSettings, fontSize: Number(e.target.value) })} style={{ width: '100%' }} />
                                </div>

                                <div className="input-group">
                                    <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                                        내 입력 색상 (RGB)
                                        <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: userColorStr, border: '1px solid var(--border-color)' }} />
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#ef4444', width: '12px', fontSize: '12px' }}>R</span> <input type="range" min="0" max="255" value={readerSettings.userColorR} onChange={e => setReaderSettings({ ...readerSettings, userColorR: Number(e.target.value) })} style={{ flex: 1, accentColor: '#ef4444' }} /></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#22c55e', width: '12px', fontSize: '12px' }}>G</span> <input type="range" min="0" max="255" value={readerSettings.userColorG} onChange={e => setReaderSettings({ ...readerSettings, userColorG: Number(e.target.value) })} style={{ flex: 1, accentColor: '#22c55e' }} /></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#3b82f6', width: '12px', fontSize: '12px' }}>B</span> <input type="range" min="0" max="255" value={readerSettings.userColorB} onChange={e => setReaderSettings({ ...readerSettings, userColorB: Number(e.target.value) })} style={{ flex: 1, accentColor: '#3b82f6' }} /></div>
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                                        본문 글씨 색상 (RGB)
                                        <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: aiColorStr, border: '1px solid var(--border-color)' }} />
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#ef4444', width: '12px', fontSize: '12px' }}>R</span> <input type="range" min="0" max="255" value={readerSettings.aiColorR} onChange={e => setReaderSettings({ ...readerSettings, aiColorR: Number(e.target.value) })} style={{ flex: 1, accentColor: '#ef4444' }} /></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#22c55e', width: '12px', fontSize: '12px' }}>G</span> <input type="range" min="0" max="255" value={readerSettings.aiColorG} onChange={e => setReaderSettings({ ...readerSettings, aiColorG: Number(e.target.value) })} style={{ flex: 1, accentColor: '#22c55e' }} /></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ color: '#3b82f6', width: '12px', fontSize: '12px' }}>B</span> <input type="range" min="0" max="255" value={readerSettings.aiColorB} onChange={e => setReaderSettings({ ...readerSettings, aiColorB: Number(e.target.value) })} style={{ flex: 1, accentColor: '#3b82f6' }} /></div>
                                    </div>
                                </div>

                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={readerSettings.showBackground}
                                            onChange={e => setReaderSettings({ ...readerSettings, showBackground: e.target.checked })} />
                                        배경 이미지 사용
                                    </label>
                                </div>

                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={readerSettings.hideUserText}
                                            onChange={e => setReaderSettings({ ...readerSettings, hideUserText: e.target.checked })} />
                                        내가 쓴 글 숨기기
                                    </label>
                                    <p className="input-help" style={{ marginTop: '0.45rem' }}>
                                        ON이면 내가 입력한 내용은 감추고 AI가 작성한 글만 보여줍니다.
                                    </p>
                                </div>
                            </div>
                        )}
                        </div>
                    </div>
                </div>

                {/* Book Reader View (Restored) */}
                <div className="book-container" style={{ flex: 1, position: 'relative', background: '#0c0d11', minHeight: 0, alignItems: isCompactReader ? 'stretch' : 'center' }}>
                    <button className={`book-nav-btn prev ${isCompactReader ? 'is-compact-reader' : ''}`} onClick={() => scrollPage('prev')} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }}>
                        <ChevronLeft size={48} />
                    </button>

                    <div className={`book-pages ratio-${readerSettings.aspectRatio} ${readerSettings.showBackground ? 'has-background-inner' : ''} ${isCompactReader ? 'is-compact-reader' : ''}`}>
                        {useVerticalReader ? (
                            <div className={`book-text-tall ${isCompactReader ? 'is-compact-reader' : ''}`} ref={bookRef} style={{
                                fontFamily: readerSettings.fontFamily, fontSize: `${readerSettings.fontSize}px`, lineHeight: readerSettings.lineHeight
                            }} onContextMenu={blockReaderProtection} onCopy={blockReaderProtection} onDragStart={blockReaderProtection}>
                                {readerSettings.hideUserText && storyMessages.length > 0 && visibleStoryMessages.length === 0 && (
                                    <div className="reader-hidden-note">
                                        내가 쓴 글은 숨김 상태입니다. AI가 작성한 글만 표시됩니다.
                                    </div>
                                )}
                                {storyMessages.length === 0 && (
                                    <div style={{ opacity: 0.8, textAlign: 'center', margin: '3rem 0', fontStyle: 'italic' }}>
                                        새로운 이야기가 시작됩니다. 지시를 입력하거나 캐릭터의 대사를 작성해 보세요.
                                    </div>
                                )}
                                {visibleStoryMessages.map(renderReaderMessage)}
                                {isSending && <p className="text-muted" style={{ fontStyle: 'italic' }}>✍️ 글을 쓰는 중입니다...</p>}
                                <div ref={chatBottomRef} />
                            </div>
                        ) : (
                            <div className={`book-text-container ${isCompactReader ? 'is-compact-reader' : ''}`} ref={bookRef} style={{
                                fontFamily: readerSettings.fontFamily, fontSize: `${readerSettings.fontSize}px`, lineHeight: readerSettings.lineHeight,
                                columnCount: isCompactReader ? 1 : 2,
                                columnFill: 'auto', columnGap: isCompactReader ? '2rem' : '4rem',
                                padding: isCompactReader ? '1.25rem 1.25rem' : '3rem 4rem',
                                height: '100%'
                            }} onContextMenu={blockReaderProtection} onCopy={blockReaderProtection} onDragStart={blockReaderProtection}>
                                {readerSettings.hideUserText && storyMessages.length > 0 && visibleStoryMessages.length === 0 && (
                                    <div className="reader-hidden-note">
                                        내가 쓴 글은 숨김 상태입니다. AI가 작성한 글만 표시됩니다.
                                    </div>
                                )}
                                {storyMessages.length === 0 && (
                                    <div style={{ opacity: 0.8, fontStyle: 'italic' }}>
                                        새로운 이야기가 시작됩니다...
                                    </div>
                                )}
                                {visibleStoryMessages.map(renderReaderMessage)}
                                {isSending && <p className="text-muted" style={{ fontStyle: 'italic' }}>✍️ 글을 쓰는 중입니다...</p>}
                            </div>
                        )}
                    </div>

                    <button className={`book-nav-btn next ${isCompactReader ? 'is-compact-reader' : ''}`} onClick={() => scrollPage('next')} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)' }}>
                        <ChevronLeft size={48} style={{ transform: 'rotate(180deg)' }} />
                    </button>
                </div>

                {/* Slider & Prompt Bar */}
                <div className={`page-slider-container ${isCompactReader ? 'is-compact-reader' : ''}`} style={{ background: '#13151c', borderTop: '1px solid var(--border-color)' }}>
                    <input type="range" className="page-slider" min={0} max={getSliderMax()} value={sliderValue} onChange={e => handleSlider(Number(e.target.value))} />
                </div>

                <div className={`prompt-bar-container ${isCompactReader ? 'is-compact-reader' : ''}`}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <input type="text" className="prompt-input"
                            placeholder={`이어 쓸 장면이나 지시를 입력하세요 (예: "마왕이 등장해 분노를 터뜨린다")`}
                            value={msgInput} maxLength={500} onChange={e => setMsgInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            style={{ width: '100%', paddingRight: '4.5rem' }} />
                        <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: msgInput.length >= 450 ? '#f87171' : 'var(--text-muted)' }}>
                            {msgInput.length}/500
                        </span>
                    </div>
                    <button className="prompt-send-btn" onClick={handleSend} disabled={isSending}><Send size={20} /></button>
                </div>

                {insufficientPointsOpen && (
                    <div className="modal-overlay" onClick={() => setInsufficientPointsOpen(false)}>
                        <div className="modal-content points-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="points-modal-icon">
                                <WalletCards size={26} />
                            </div>
                            <h2 className="title-font">포인트가 부족합니다</h2>
                            <p className="text-muted" style={{ lineHeight: 1.7, textAlign: 'center' }}>
                                {insufficientPointMessage}
                            </p>
                            <div className="points-modal-summary">
                                <div>
                                    <span>보유</span>
                                    <strong>{formatPointAmount(insufficientPointHave)}</strong>
                                </div>
                                <div>
                                    <span>필요</span>
                                    <strong>{formatPointAmount(insufficientPointNeed)}</strong>
                                </div>
                            </div>
                            <div className="points-modal-actions">
                                <button className="btn btn-outline" onClick={() => setInsufficientPointsOpen(false)}>나중에</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        setInsufficientPointsOpen(false);
                                        navigate('points');
                                    }}
                                >
                                    충전하러 가기
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {bindingQuoteOpen && (
                    <div className="modal-overlay" onClick={closeBindingQuote}>
                        <div className="modal-content points-modal binding-quote-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="points-modal-icon">
                                <ScrollText size={26} />
                            </div>
                            <span className="badge badge-gold">A5 제본 출력</span>
                            <h2 className="title-font">제본용 포인트 안내</h2>
                            <p className="text-muted" style={{ lineHeight: 1.7, textAlign: 'center' }}>
                                선택한 제본 페이지 합계당 1포인트가 차감됩니다. 아래 예상 차감 금액을 확인하고 제본 페이지로 이동할 수 있습니다.
                            </p>
                            <div className="points-modal-summary binding-quote-summary">
                                <div>
                                    <span>선택한 총 페이지</span>
                                    <strong>{bindingQuoteEstimatedPages}장</strong>
                                </div>
                                <div>
                                    <span>현재 잔액</span>
                                    <strong>{formatPointAmount(bindingQuoteBalance)}</strong>
                                </div>
                                <div>
                                    <span>예상 차감</span>
                                    <strong>{formatPointAmount(bindingQuoteCost)}</strong>
                                </div>
                            </div>
                            <div className="binding-option-panel">
                                <label className="binding-option-row">
                                    <input
                                        type="checkbox"
                                        checked={bindingQuotePreviewOptions.includeCover}
                                        onChange={(e) => updateBindingOption({ includeCover: e.target.checked })}
                                    />
                                    <span>표지 추가</span>
                                    <strong>+1P</strong>
                                </label>
                                <label className="binding-option-row">
                                    <input
                                        type="checkbox"
                                        checked={bindingQuotePreviewOptions.includeUserText}
                                        onChange={(e) => updateBindingOption({ includeUserText: e.target.checked })}
                                    />
                                    <span>사용자 텍스트 포함</span>
                                    <strong>기본 포함</strong>
                                </label>
                                <label className="binding-option-row">
                                    <input
                                        type="checkbox"
                                        checked={bindingQuotePreviewOptions.includeAuthorNote}
                                        onChange={(e) => updateBindingOption({ includeAuthorNote: e.target.checked })}
                                    />
                                    <span>작가의 말 추가</span>
                                    <strong>+1P</strong>
                                </label>
                            </div>
                            {bindingQuoteEstimatedPages === 0 && (
                                <p className="text-negative" style={{ textAlign: 'center', fontSize: '0.82rem' }}>
                                    출력할 페이지가 없습니다. 사용자 텍스트 포함 또는 제본 옵션을 다시 선택해 주세요.
                                </p>
                            )}
                            {bindingQuotePreviewOptions.includeAuthorNote && (
                                <div className="input-group" style={{ width: '100%' }}>
                                    <label>작가의 말</label>
                                    <textarea
                                        className="input-control binding-author-note-input"
                                        value={bindingQuotePreviewOptions.authorNoteText}
                                        maxLength={bindingQuoteAuthorNoteLimit}
                                        onChange={(e) => updateBindingOption({ authorNoteText: e.target.value })}
                                        placeholder="출력할 작가의 말을 입력하세요."
                                    />
                                    <p className="input-help" style={{ marginTop: '0.4rem' }}>
                                        최대 {bindingQuoteAuthorNoteLimit}자까지 입력할 수 있습니다. 선택 시 1포인트가 추가 차감됩니다.
                                    </p>
                                </div>
                            )}
                            <p className={`text-muted${bindingQuoteRemaining < 0 ? ' text-negative' : ''}`} style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                                {bindingQuoteRemaining < 0
                                    ? `포인트가 ${formatPointAmount(Math.abs(bindingQuoteRemaining))} 부족합니다. 충전이 필요합니다.`
                                    : `차감 후 예상 잔액: ${formatPointAmount(bindingQuoteRemaining)}`}
                            </p>
                            {bindingQuotePreviewOptions.includeAuthorNote && !(bindingQuotePreviewOptions.authorNoteText || '').trim() && (
                                <p className="text-negative" style={{ textAlign: 'center', fontSize: '0.82rem' }}>
                                    작가의 말을 입력해야 제본을 진행할 수 있습니다.
                                </p>
                            )}
                            {bindingOpenError && <p className="text-negative" style={{ textAlign: 'center' }}>{bindingOpenError}</p>}
                            <div className="points-modal-actions">
                                <button className="btn btn-outline" onClick={closeBindingQuote} disabled={bindingQuoteLoading}>취소</button>
                                <button className="btn btn-primary" onClick={() => void confirmBindingExport()} disabled={bindingQuoteLoading || bindingQuoteEstimatedPages === 0 || (bindingQuotePreviewOptions.includeAuthorNote && !(bindingQuotePreviewOptions.authorNoteText || '').trim())}>
                                    {bindingQuoteLoading ? '준비 중...' : '확인'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ── Admin view ───────────────────────────────────────────
    const renderAdmin = () => {
        if (!user || user.role !== 'admin') {
            return (
                <div className="main-content fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                    <div className="glass-panel" style={{ width: 'min(100%, 420px)', textAlign: 'center', padding: '2.5rem' }}>
                        <ShieldAlert size={48} className="text-accent" style={{ margin: '0 auto 1rem' }} />
                        <h1 className="title-font" style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>관리자 권한이 필요합니다</h1>
                        <p className="text-muted" style={{ lineHeight: 1.7 }}>
                            Apple 버튼으로 관리자 로그인 후 이용할 수 있습니다.
                        </p>
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }} onClick={() => navigate('login')}>
                            로그인하기
                        </button>
                    </div>
                </div>
            );
        }

        const dashboard = adminDashboard;
        const summary = dashboard?.summary;
        const databaseStats = dashboard?.databaseStats;
        const pointDashboard = adminPointDashboard;
        const pointSummary = pointDashboard?.summary;
        const pointLedger = pointDashboard?.ledger || [];
        const pointTopUsers = pointDashboard?.topUsers || [];
        const pointLedgerPageSize = 8;
        const pointLedgerTotalPages = Math.max(1, Math.ceil((adminPointUserDetail?.recentTransactions.length || 0) / pointLedgerPageSize));
        const pointLedgerPage = Math.min(adminPointLedgerPage, pointLedgerTotalPages - 1);
        const visiblePointLedger = adminPointUserDetail
            ? adminPointUserDetail.recentTransactions.slice(pointLedgerPage * pointLedgerPageSize, (pointLedgerPage + 1) * pointLedgerPageSize)
            : [];
        const query = adminQuery.trim().toLowerCase();
        const numberFmt = new Intl.NumberFormat('ko-KR');
        const formatCount = (value: number | null | undefined) => numberFmt.format(Number(value || 0));
        const formatDate = (value?: string | null) => value ? value.slice(0, 10) : '-';
        const formatDateTime = (value?: string | null) => value ? value.replace('T', ' ').slice(0, 16) : '-';
        const formatHourLabel = (value?: string | null) => value ? value.slice(11, 16) : '-';
        const formatDayLabel = (value?: string | null) => value ? value.slice(5, 10).replace('-', '/') : '-';
        const formatKb = (value?: number | string | null) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? `${numeric.toFixed(2)} MB` : '-';
        };
        const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`;
        const includesQuery = (value: unknown) => String(value ?? '').toLowerCase().includes(query);
        const periodUsage = databaseStats?.rangeUsage || [];
        const rangeSummary = databaseStats?.rangeSummary;
        const selectedRange = databaseStats?.selectedRange;
        const seriesOrder = ['users', 'stories', 'messages'] as AdminSeriesKey[];
        const activeSeries = seriesOrder.filter((key) => adminSeriesFilters[key]);
        const chartSeriesKeys = activeSeries.length ? activeSeries : seriesOrder;
        const chartHeight = 260;
        const chartWidth = 1000;
        const chartPaddingX = 52;
        const chartPaddingTop = 22;
        const chartPaddingBottom = 42;
        const chartInnerWidth = chartWidth - chartPaddingX * 2;
        const chartInnerHeight = chartHeight - chartPaddingTop - chartPaddingBottom;
        const getSeriesValue = (row: AdminSeriesRow, key: AdminSeriesKey) => (
            key === 'users' ? row.userCount : key === 'stories' ? row.storyCount : row.messageCount
        );
        const chartSeriesMeta: Record<AdminSeriesKey, { label: string; color: string; countKey: 'userCount' | 'storyCount' | 'messageCount' }> = {
            users: { label: '회원', color: '#60a5fa', countKey: 'userCount' },
            stories: { label: '이야기', color: '#34d399', countKey: 'storyCount' },
            messages: { label: '메시지', color: '#f59e0b', countKey: 'messageCount' },
        };
        const chartSeries = chartSeriesKeys.map((key) => ({
            key,
            ...chartSeriesMeta[key],
        }));
        const chartTotals = chartSeries.map((series) => ({
            ...series,
            total: periodUsage.reduce((sum, row) => sum + getSeriesValue(row, series.key), 0),
        }));
        const chartMax = Math.max(
            1,
            ...periodUsage.map((row) => Math.max(...chartSeriesKeys.map((key) => getSeriesValue(row, key))))
        );
        const buildChartPath = (key: AdminSeriesKey) => {
            if (!periodUsage.length) return '';
            if (periodUsage.length === 1) {
                const value = getSeriesValue(periodUsage[0], key);
                const x = chartPaddingX + chartInnerWidth / 2;
                const y = chartPaddingTop + chartInnerHeight - (value / chartMax) * chartInnerHeight;
                return `M ${x} ${y} L ${x + 0.1} ${y}`;
            }

            return periodUsage
                .map((row, index) => {
                    const x = chartPaddingX + (chartInnerWidth * index / (periodUsage.length - 1));
                    const y = chartPaddingTop + chartInnerHeight - (getSeriesValue(row, key) / chartMax) * chartInnerHeight;
                    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
                })
                .join(' ');
        };
        const chartPoints = chartSeries.map((series) => ({
            ...series,
            path: buildChartPath(series.key),
        }));
        const chartTicks = periodUsage.filter((_, index) => {
            if (periodUsage.length <= 6) return true;
            return index === 0 || index === periodUsage.length - 1 || index % Math.ceil(periodUsage.length / 4) === 0;
        });
        const chartRangeLabel = selectedRange?.label || '기간을 선택하세요';
        const resolveStoryStatus = (story: { isPublic: number; publicStatus?: string | null; publicMethod?: string | null; publicReviewMessage?: string | null }) => (
            resolveStoryVisibilityInfo(story)
        );

        const filteredUsers = (dashboard?.users || []).filter((u) =>
            !query || [u.name, u.email, u.provider, u.role, u.id].some(includesQuery)
        );
        const filteredStories = (dashboard?.stories || []).filter((story) =>
            !query || [story.title, story.background, story.environment, story.authorName, story.authorEmail, story.id].some(includesQuery)
        );
        const filteredPublicRequests = (dashboard?.publicRequests || []).filter((story) =>
            !query || [story.title, story.background, story.environment, story.authorName, story.authorEmail, story.publicReviewMessage, story.id].some(includesQuery)
        );
        const filteredReviewHistory = (dashboard?.publicReviewHistory || []).filter((story) =>
            !query || [story.title, story.background, story.environment, story.authorName, story.authorEmail, story.publicReviewMessage, story.id].some(includesQuery)
        );
        const visiblePublicRequests = adminRequestPreset === 'all'
            ? filteredPublicRequests
            : filteredPublicRequests.filter((story) => isWithinDateRange(story.publicRequestedAt || story.createdAt, adminRequestStart, adminRequestEnd));
        const visibleReviewHistory = adminRequestPreset === 'all'
            ? filteredReviewHistory
            : filteredReviewHistory.filter((story) => isWithinDateRange(story.publicReviewedAt || story.publicRequestedAt || story.createdAt, adminRequestStart, adminRequestEnd));
        const filteredMessages = (dashboard?.messages || []).filter((message) =>
            !query || [message.content, message.storyTitle, message.authorName, message.role, message.id, message.storyId].some(includesQuery)
        );
        const filteredPublicStories = (dashboard?.publicStories || []).filter((story) =>
            !query || [story.title, story.background, story.environment, story.authorName, story.id].some(includesQuery)
        );
        const filteredPointLedger = pointLedger.filter((row) =>
            !query || [row.userName, row.userEmail, row.transactionType, row.note, row.amount, row.balanceAfter, row.id].some(includesQuery)
        );

        const tabs: { key: AdminTab; label: string; icon: JSX.Element }[] = [
            { key: 'overview', label: '개요', icon: <BarChart3 size={16} /> },
            { key: 'users', label: '회원', icon: <Users size={16} /> },
            { key: 'stories', label: '이야기', icon: <ScrollText size={16} /> },
            { key: 'requests', label: `승인 요청${summary?.publicRequestCount ? ` (${formatCount(summary.publicRequestCount)})` : ''}`, icon: <ShieldAlert size={16} /> },
            { key: 'messages', label: '메시지', icon: <MessageSquareText size={16} /> },
            { key: 'public', label: '공개작', icon: <Globe size={16} /> },
            { key: 'points', label: '포인트', icon: <Coins size={16} /> },
            { key: 'database', label: 'DB 상태', icon: <Database size={16} /> },
        ];

        const handleAdminStoryReview = async (storyId: number, action: 'approve' | 'reject') => {
            const note = (adminReviewNotes[storyId] || '').trim();
            if (action === 'reject' && !note) {
                alert('반려 사유를 입력해주세요.');
                return;
            }

            const confirmed = confirm(action === 'approve' ? '이 요청을 승인할까요?' : '이 요청을 반려할까요?');
            if (!confirmed) return;

            try {
                setAdminMutation(`review:${storyId}`);
                await reviewAdminStory(storyId, { action, reason: action === 'reject' ? note : undefined });
                setAdminReviewNotes((prev) => {
                    const next = { ...prev };
                    delete next[storyId];
                    return next;
                });
                await refreshAdminData();
            } catch (err: unknown) {
                console.error('Review story failed:', err);
                alert(`승인 처리 실패: ${getErrorMessage(err)}`);
            } finally {
                setAdminMutation(null);
            }
        };

        return (
            <div className="main-content fade-in admin-dashboard">
                <div className="admin-hero glass-panel">
                    <div>
                        <div className="admin-hero-title">
                            <ShieldAlert size={22} className="text-accent" />
                            <h1 className="title-font" style={{ fontSize: '1.6rem' }}>관리자 패널</h1>
                        </div>
                        <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                            회원, 이야기, 메시지, 공개 콘텐츠, DB 규모를 한 화면에서 확인하는 운영 대시보드입니다.
                        </p>
                    </div>
                    <div className="admin-hero-actions">
                        <button className="btn btn-outline" onClick={openAdmin} disabled={adminLoading}>
                            <RefreshCw size={16} /> 새로고침
                        </button>
                        <div className="admin-hero-meta">
                            <span className="badge badge-gold">DB {dashboard?.database.name || 'unknown'}</span>
                            <span className="badge badge-green">{adminLoading ? '불러오는 중' : '실시간 현황'}</span>
                        </div>
                    </div>
                </div>

                {adminError && (
                    <div className="glass-panel" style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>
                        <strong>불러오기 실패</strong>
                        <p className="text-muted" style={{ marginTop: '0.35rem' }}>{adminError}</p>
                    </div>
                )}

                <div className="admin-tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            className={`admin-tab ${adminTab === tab.key ? 'is-active' : ''}`}
                            onClick={() => setAdminTab(tab.key)}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                {adminTab !== 'database' && (
                    <>
                        <div className="admin-summary-grid">
                            {[
                                { label: '회원', value: summary?.userCount ?? 0, sub: `관리자 ${summary?.adminCount ?? 0}명` },
                                { label: '이야기', value: summary?.storyCount ?? 0, sub: `공개 ${summary?.publicStoryCount ?? 0}편` },
                                { label: '승인 요청', value: summary?.publicRequestCount ?? 0, sub: '관리자 검토 대기' },
                                { label: '메시지', value: summary?.messageCount ?? 0, sub: `하루 ${summary?.messages24h ?? 0}건 · 작성자 ${summary?.activeWriterCount ?? 0}명` },
                                { label: '등장인물', value: summary?.characterCount ?? 0, sub: `이야기 ${summary?.storyOwnerCount ?? 0}개` },
                                { label: '정지 회원', value: summary?.suspendedCount ?? 0, sub: `24시간 신규 ${summary?.users24h ?? 0}명` },
                                { label: 'DB 용량', value: summary?.databaseSizeMb ?? 0, sub: dashboard?.database.name || 'novelai_db' },
                            ].map((card) => (
                                <div key={card.label} className="admin-metric-card glass-panel">
                                    <p className="admin-metric-label">{card.label}</p>
                                    <div className="admin-metric-value">
                                        {card.label === 'DB 용량' ? `${Number(card.value || 0).toFixed(2)} MB` : formatCount(card.value as number)}
                                    </div>
                                    <p className="admin-metric-sub">{card.sub}</p>
                                </div>
                            ))}
                        </div>

                        <div className="admin-search-row glass-panel">
                            <div className="admin-search-box">
                                <Search size={16} className="text-muted" />
                                <input
                                    className="admin-search-input"
                                    placeholder="회원명, 이야기 제목, 메시지, 이메일 검색"
                                    value={adminQuery}
                                    onChange={e => setAdminQuery(e.target.value)}
                                />
                            </div>
                            <div className="admin-search-hint text-muted">
                                최근 갱신 {formatDateTime(dashboard?.stories?.[0]?.updatedAt)} · 최근 메시지 {formatDateTime(dashboard?.messages?.[0]?.createdAt)}
                            </div>
                        </div>
                    </>
                )}

                {adminTab === 'overview' && (
                    <div className="admin-overview-grid">
                        <div className="admin-panel glass-panel">
                            <div className="section-title-row" style={{ marginBottom: '1rem' }}>
                                <h2 className="section-title">최근 이야기</h2>
                                <span className="section-limit">최근 {dashboard?.stories.length || 0}건</span>
                            </div>
                            <div className="admin-card-list">
                                {filteredStories.slice(0, 5).map((story) => (
                                    <div key={story.id} className="admin-feed-card">
                                        <div className="admin-feed-head">
                                            <div>
                                                <strong>{story.title}</strong>
                                                <p className="text-muted admin-feed-sub">
                                                    {story.authorName || '알 수 없음'} · 인물 {story.characterCount}명 · 메시지 {story.messageCount}건
                                                </p>
                                            </div>
                                            {(() => {
                                                const visibility = resolveStoryStatus(story);
                                                return (
                                                    <span className={`badge ${visibility.badge}`}>
                                                        {visibility.label}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        <p className="admin-feed-text">{story.background || story.environment || '설명이 없습니다.'}</p>
                                    </div>
                                ))}
                                {filteredStories.length === 0 && <p className="text-muted">표시할 이야기가 없습니다.</p>}
                            </div>
                        </div>

                        <div className="admin-panel glass-panel">
                            <div className="section-title-row" style={{ marginBottom: '1rem' }}>
                                <h2 className="section-title">최근 메시지</h2>
                                <span className="section-limit">최근 {dashboard?.messages.length || 0}건</span>
                            </div>
                            <div className="admin-card-list">
                                {filteredMessages.slice(0, 8).map((message) => (
                                    <div key={message.id} className="admin-feed-card">
                                        <div className="admin-feed-head">
                                            <div>
                                                <strong>{message.storyTitle || '이야기 없음'}</strong>
                                                <p className="text-muted admin-feed-sub">
                                                    {message.authorName || '알 수 없음'} · {message.role === 'user' ? '사용자' : 'AI'} · {formatDateTime(message.createdAt)}
                                                </p>
                                            </div>
                                            <span className={`badge ${message.role === 'assistant' ? 'badge-green' : 'badge-gold'}`}>
                                                {message.role === 'assistant' ? 'AI' : '사용자'}
                                            </span>
                                        </div>
                                        <p className="admin-feed-text">{message.content}</p>
                                    </div>
                                ))}
                                {filteredMessages.length === 0 && <p className="text-muted">표시할 메시지가 없습니다.</p>}
                            </div>
                        </div>
                    </div>
                )}

                {adminTab === 'users' && (
                    <div className="glass-panel admin-table-panel">
                        <div className="section-title-row" style={{ marginBottom: '1rem' }}>
                            <h2 className="section-title">회원 목록</h2>
                            <span className="section-limit">{formatCount(filteredUsers.length)}명</span>
                        </div>
                        <div className="admin-table-wrap">
                            <table className="admin-table admin-users-table">
                                <thead>
                                    <tr><th>ID</th><th>이름</th><th>역할</th><th>상태</th><th>포인트</th><th>공개권한</th><th>작업</th><th>가입일</th></tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((u) => (
                                        <tr key={u.id}>
                                            <td>
                                                <button
                                                    className="admin-user-id-btn"
                                                    onClick={() => void openAdminPointUser(u.id)}
                                                    disabled={adminPointUserLoading}
                                                >
                                                    #{u.id}
                                                </button>
                                            </td>
                                            <td>
                                                <strong>{u.name}</strong>
                                                <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                                                    {u.provider}
                                                </div>
                                            </td>
                                            <td><span className={`badge ${u.role === 'admin' ? 'badge-red' : 'badge-green'}`}>{u.role}</span></td>
                                            <td>
                                                <span className={`badge ${u.isSuspended ? 'badge-red' : 'badge-green'}`}>
                                                    {u.isSuspended ? '정지' : '정상'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="badge badge-gold">{formatPointAmount(u.pointBalance)}</span>
                                            </td>
                                            <td>{u.canPublishCommunity ? '✅' : '—'}</td>
                                            <td>
                                                <div className="admin-row-actions">
                                                    <button
                                                        className="btn btn-outline admin-inline-btn"
                                                        onClick={() => updateAdminUserStatus(u.id, { isPremium: !u.isPremium })}
                                                        disabled={u.role === 'admin' || adminMutation === `user:${u.id}`}
                                                    >
                                                        {u.isPremium ? '프리미엄 끄기' : '프리미엄 켜기'}
                                                    </button>
                                                    <button
                                                        className="btn btn-outline admin-inline-btn"
                                                        onClick={() => updateAdminUserStatus(u.id, { canPublishCommunity: !u.canPublishCommunity })}
                                                        disabled={u.role === 'admin' || adminMutation === `user:${u.id}`}
                                                    >
                                                        {u.canPublishCommunity ? '공개권한 회수' : '공개권한 부여'}
                                                    </button>
                                                    <button
                                                        className={`btn btn-outline admin-inline-btn ${u.isSuspended ? 'is-danger' : ''}`}
                                                        onClick={() => updateAdminUserStatus(u.id, { isSuspended: !u.isSuspended })}
                                                        disabled={u.role === 'admin' || adminMutation === `user:${u.id}`}
                                                    >
                                                        {u.isSuspended ? '정지 해제' : '정지'}
                                                    </button>
                                                    <button
                                                        className="btn btn-outline admin-inline-btn"
                                                        onClick={() => void openAdminPointUser(u.id)}
                                                        disabled={adminPointUserLoading}
                                                    >
                                                        {adminPointUserLoading ? '불러오는 중' : '상세'}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="text-muted" style={{ fontSize: '0.8rem' }}>{formatDate(u.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {adminTab === 'stories' && (
                    <div className="glass-panel admin-table-panel">
                        <div className="section-title-row" style={{ marginBottom: '1rem' }}>
                            <h2 className="section-title">이야기 목록</h2>
                            <span className="section-limit">최근 {dashboard?.stories.length || 0}건</span>
                        </div>
                        <div className="admin-table-wrap">
                            <table className="admin-table admin-stories-table">
                                <thead>
                                    <tr><th>ID</th><th>제목</th><th>작성자</th><th>상태</th><th>인물</th><th>메시지</th><th>상세</th><th>작업</th><th>수정일</th></tr>
                                </thead>
                                <tbody>
                                    {filteredStories.map((story) => (
                                        <tr key={story.id}>
                                            <td className="text-muted">{story.id}</td>
                                            <td>
                                                <strong>{story.title}</strong>
                                                <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                                                    {story.environment || story.background || '설명 없음'}
                                                </div>
                                            </td>
                                            <td>{story.authorName || '알 수 없음'}</td>
                                            <td>
                                                {(() => {
                                                    const visibility = resolveStoryStatus(story);
                                                    return <span className={`badge ${visibility.badge}`}>{visibility.label}</span>;
                                                })()}
                                            </td>
                                            <td>{story.characterCount}명</td>
                                            <td>{story.messageCount}건</td>
                                            <td>
                                                <button
                                                    className="btn btn-outline admin-inline-btn"
                                                    onClick={() => void openAdminStoryDetail(story.id)}
                                                    disabled={adminStoryLoading}
                                                >
                                                    {adminStoryLoading ? '불러오는 중' : '상세'}
                                                </button>
                                            </td>
                                            <td>
                                                <div className="admin-row-actions">
                                                    <button
                                                        className="btn btn-outline admin-inline-btn"
                                                        onClick={() => void toggleAdminStoryVisibility(story.id, !story.isPublic)}
                                                        disabled={adminMutation === `story:${story.id}:visibility`}
                                                    >
                                                        {story.isPublic ? '비공개' : '공개'}
                                                    </button>
                                                    <button
                                                        className="btn btn-outline admin-inline-btn is-danger"
                                                        onClick={() => void deleteAdminStoryById(story.id)}
                                                        disabled={adminMutation === `story:${story.id}:delete`}
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="text-muted" style={{ fontSize: '0.8rem' }}>{formatDateTime(story.updatedAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {adminTab === 'requests' && (
                    <>
                        <div className="glass-panel admin-request-toolbar" style={{ marginBottom: '1rem' }}>
                            <div className="section-title-row" style={{ marginBottom: '0.85rem' }}>
                                <h2 className="section-title">승인 요청 필터</h2>
                                <span className="section-limit">
                                    {adminRequestPreset === 'all'
                                        ? '전체 기간'
                                        : adminRequestPreset === 'custom'
                                            ? '직접 지정'
                                            : adminRequestPreset === '7d'
                                                ? '최근 7일'
                                                : '최근 30일'}
                                </span>
                            </div>
                            <div className="admin-db-range-controls">
                                <div className="admin-db-range-presets">
                                    <button
                                        className={`admin-db-toggle-chip ${adminRequestPreset === 'all' ? 'is-active' : ''}`}
                                        onClick={() => setAdminRequestPreset('all')}
                                    >
                                        전체
                                    </button>
                                    {(['7d', '30d'] as const).map((preset) => (
                                        <button
                                            key={preset}
                                            className={`admin-db-toggle-chip ${adminRequestPreset === preset ? 'is-active' : ''}`}
                                            onClick={() => {
                                                const presetRange = getPresetRange(preset);
                                                setAdminRequestPreset(preset);
                                                setAdminRequestStart(presetRange.start);
                                                setAdminRequestEnd(presetRange.end);
                                            }}
                                        >
                                            {preset === '7d' ? '최근 7일' : '최근 30일'}
                                        </button>
                                    ))}
                                    <button
                                        className={`admin-db-toggle-chip ${adminRequestPreset === 'custom' ? 'is-active' : ''}`}
                                        onClick={() => setAdminRequestPreset('custom')}
                                    >
                                        직접 지정
                                    </button>
                                </div>

                                {adminRequestPreset === 'custom' && (
                                    <div className="admin-db-range-inputs">
                                        <label>
                                            시작
                                            <input
                                                type="datetime-local"
                                                className="input-control"
                                                value={adminRequestStart}
                                                onChange={(e) => setAdminRequestStart(e.target.value)}
                                            />
                                        </label>
                                        <label>
                                            종료
                                            <input
                                                type="datetime-local"
                                                className="input-control"
                                                value={adminRequestEnd}
                                                onChange={(e) => setAdminRequestEnd(e.target.value)}
                                            />
                                        </label>
                                    </div>
                                )}

                                <p className="admin-db-side-note" style={{ marginBottom: 0 }}>
                                    승인 요청과 처리 내역은 선택한 기간으로 함께 필터링됩니다.
                                </p>
                            </div>
                        </div>

                        <div className="admin-request-grid">
                            <div className="glass-panel admin-request-panel">
                                <div className="section-title-row" style={{ marginBottom: '1rem' }}>
                                    <h2 className="section-title">승인 요청</h2>
                                    <span className="section-limit">{formatCount(visiblePublicRequests.length)}건</span>
                                </div>
                                <div className="admin-request-list">
                                    {visiblePublicRequests.map((story) => {
                                        const visibility = resolveStoryStatus(story);
                                        return (
                                            <div key={story.id} className="admin-request-card">
                                                <div
                                                    className="admin-request-cover"
                                                    style={{
                                                        backgroundImage: story.coverImageUrl
                                                            ? `url(${story.coverImageUrl})`
                                                            : 'linear-gradient(180deg, #f7efe2 0%, #e7d7bc 100%)',
                                                    }}
                                                >
                                                    {!story.coverImageUrl && <span>표지 없음</span>}
                                                </div>
                                                <div className="admin-request-body">
                                                    <div className="admin-feed-head">
                                                        <div>
                                                            <strong>{story.title}</strong>
                                                            <p className="text-muted admin-feed-sub">
                                                                {story.authorName || '알 수 없음'} · {formatDateTime(story.publicRequestedAt || story.createdAt)}
                                                            </p>
                                                        </div>
                                                        <span className={`badge ${visibility.badge}`}>{visibility.label}</span>
                                                    </div>
                                                    <p className="admin-feed-text">
                                                        {story.background || story.environment || '설명이 없습니다.'}
                                                    </p>
                                                    <div className="admin-request-meta">
                                                        <span>인물 {story.characterCount}명</span>
                                                        <span>메시지 {story.messageCount}건</span>
                                                        <span>{story.authorEmail || '-'}</span>
                                                    </div>
                                                    <textarea
                                                        className="input-control admin-request-note"
                                                        placeholder="반려 시 사유를 입력하세요"
                                                        value={adminReviewNotes[story.id] || ''}
                                                        onChange={(e) => setAdminReviewNotes((prev) => ({ ...prev, [story.id]: e.target.value }))}
                                                    />
                                                    <div className="admin-request-actions">
                                                        <button
                                                            className="btn btn-primary"
                                                            onClick={() => void handleAdminStoryReview(story.id, 'approve')}
                                                            disabled={adminMutation === `review:${story.id}`}
                                                        >
                                                            승인
                                                        </button>
                                                        <button
                                                            className="btn btn-outline is-danger"
                                                            onClick={() => void handleAdminStoryReview(story.id, 'reject')}
                                                            disabled={adminMutation === `review:${story.id}`}
                                                        >
                                                            반려
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {visiblePublicRequests.length === 0 && <p className="text-muted">승인 요청이 없습니다.</p>}
                                </div>
                            </div>

                            <div className="glass-panel admin-request-panel">
                                <div className="section-title-row" style={{ marginBottom: '1rem' }}>
                                    <h2 className="section-title">처리 내역</h2>
                                    <span className="section-limit">{formatCount(visibleReviewHistory.length)}건</span>
                                </div>
                                <div className="admin-request-history">
                                    {visibleReviewHistory.slice(0, 12).map((story) => {
                                        const visibility = resolveStoryStatus(story);
                                        return (
                                            <div key={`history-${story.id}`} className="admin-request-history-card">
                                                <div className="admin-feed-head">
                                                    <div>
                                                        <strong>{story.title}</strong>
                                                        <p className="text-muted admin-feed-sub">
                                                            {story.authorName || '알 수 없음'} · {formatDateTime(story.publicReviewedAt || story.updatedAt)}
                                                        </p>
                                                    </div>
                                                    <span className={`badge ${visibility.badge}`}>{visibility.label}</span>
                                                </div>
                                                <p className="admin-feed-text">
                                                    {story.publicReviewMessage || story.background || story.environment || '처리 메모가 없습니다.'}
                                                </p>
                                            </div>
                                        );
                                    })}
                                    {visibleReviewHistory.length === 0 && <p className="text-muted">처리 내역이 없습니다.</p>}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {adminTab === 'messages' && (
                    <div className="glass-panel admin-table-panel">
                        <div className="section-title-row" style={{ marginBottom: '1rem' }}>
                            <h2 className="section-title">메시지 로그</h2>
                            <span className="section-limit">최근 {dashboard?.messages.length || 0}건</span>
                        </div>
                        <div className="admin-table-wrap">
                            <table className="admin-table admin-messages-table">
                                <thead>
                                    <tr><th>ID</th><th>이야기</th><th>작성자</th><th>역할</th><th>본문</th><th>작성일</th></tr>
                                </thead>
                                <tbody>
                                    {filteredMessages.map((message) => (
                                        <tr key={message.id}>
                                            <td className="text-muted">{message.id}</td>
                                            <td>{message.storyTitle || `이야기 #${message.storyId}`}</td>
                                            <td>{message.authorName || '알 수 없음'}</td>
                                            <td><span className={`badge ${message.role === 'assistant' ? 'badge-green' : 'badge-gold'}`}>{message.role}</span></td>
                                            <td style={{ maxWidth: 560 }}>
                                                <div className="admin-message-snippet">{message.content}</div>
                                            </td>
                                            <td className="text-muted" style={{ fontSize: '0.8rem' }}>{formatDateTime(message.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {adminTab === 'public' && (
                    <div className="glass-panel">
                        <div className="section-title-row" style={{ marginBottom: '1rem' }}>
                            <h2 className="section-title">공개 이야기</h2>
                            <span className="section-limit">{formatCount(filteredPublicStories.length)}편</span>
                        </div>
                        <div className="admin-public-grid">
                            {filteredPublicStories.map((story) => (
                                <div key={story.id} className="admin-public-card">
                                    <div className="admin-feed-head">
                                        <div>
                                            <strong>{story.title}</strong>
                                            <p className="text-muted admin-feed-sub">
                                                {story.authorName || '알 수 없음'} · 인물 {story.characterCount}명 · 메시지 {story.messageCount}건
                                            </p>
                                        </div>
                                        <span className="badge badge-green">공개</span>
                                    </div>
                                    <p className="admin-feed-text">{story.background || story.environment || '설명이 없습니다.'}</p>
                                </div>
                            ))}
                            {filteredPublicStories.length === 0 && <p className="text-muted">공개된 이야기가 없습니다.</p>}
                        </div>
                    </div>
                )}

                {adminTab === 'points' && (
                    <div className="admin-points-shell">
                        <div className="glass-panel admin-points-hero">
                            <div>
                                <div className="admin-hero-title">
                                    <Coins size={22} className="text-accent" />
                                    <h2 className="section-title" style={{ marginBottom: 0 }}>포인트 관리</h2>
                                </div>
                                <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                                    충전, 지급, 회수, 사용 흐름을 확인하고 회원별 잔액을 조정할 수 있습니다.
                                </p>
                            </div>
                            <div className="admin-hero-actions">
                                <button className="btn btn-outline" onClick={() => void loadAdminPointDashboard()} disabled={adminPointLoading}>
                                    <RefreshCw size={16} /> 새로고침
                                </button>
                            </div>
                        </div>

                        {adminPointError && (
                            <div className="glass-panel" style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>
                                <strong>포인트 대시보드 불러오기 실패</strong>
                                <p className="text-muted" style={{ marginTop: '0.35rem' }}>{adminPointError}</p>
                            </div>
                        )}

                        <div className="admin-summary-grid">
                            {[
                                { label: '총 잔액', value: pointSummary?.totalBalance ?? 0, sub: `회원 ${pointSummary?.userCount ?? 0}명` },
                                { label: '총 유입', value: pointSummary?.totalInflow ?? 0, sub: `충전 ${formatPointAmount(pointSummary?.totalTopup ?? 0)}` },
                                { label: '총 유출', value: pointSummary?.totalOutflow ?? 0, sub: `대화 ${formatPointAmount(pointSummary?.chatSpent ?? 0)} · 제본 ${formatPointAmount(pointSummary?.bindingSpent ?? 0)}` },
                                { label: '제본 차감', value: pointSummary?.bindingSpent ?? 0, sub: 'A5 제본 출력' },
                                { label: '웰컴 지급', value: pointSummary?.welcomeGranted ?? 0, sub: '회원가입 첫 지급' },
                                { label: '관리자 지급', value: pointSummary?.adminGranted ?? 0, sub: `회수 ${formatPointAmount(pointSummary?.adminDeducted ?? 0)}` },
                                { label: '24시간 변동', value: pointSummary?.net24h ?? 0, sub: `최근 ${pointSummary?.transactions24h ?? 0}건` },
                            ].map((card) => (
                                <div key={card.label} className="admin-metric-card glass-panel">
                                    <p className="admin-metric-label">{card.label}</p>
                                    <div className="admin-metric-value">{formatPointAmount(card.value as number)}</div>
                                    <p className="admin-metric-sub">{card.sub}</p>
                                </div>
                            ))}
                        </div>

                        <div className="admin-points-grid">
                            <div className="glass-panel admin-points-panel">
                                <div className="section-title-row" style={{ marginBottom: '1rem' }}>
                                    <h3 className="section-title">최근 포인트 흐름</h3>
                                    <span className="section-limit">{formatCount(filteredPointLedger.length)}건</span>
                                </div>
                                {adminPointLoading && !pointDashboard ? (
                                    <p className="text-muted">포인트 흐름을 불러오는 중입니다...</p>
                                ) : (
                                    <div className="points-ledger">
                                        {filteredPointLedger.slice(0, 30).map((tx) => (
                                            <div key={tx.id} className="points-ledger-item">
                                                <div>
                                                    <div className="points-ledger-head">
                                                        <strong>{tx.userName || '알 수 없음'}</strong>
                                                        <span className={tx.amount >= 0 ? 'text-positive' : 'text-negative'}>
                                                            {tx.amount >= 0 ? '+' : ''}{formatPointAmount(tx.amount)}
                                                        </span>
                                                    </div>
                                                    <p className="text-muted points-ledger-note">
                                                        {formatPointTransactionTypeLabel(tx.transactionType)} · {tx.note || '메모 없음'} · {tx.userEmail || '-'}
                                                    </p>
                                                </div>
                                                <div className="points-ledger-meta">
                                                    <span>{formatDateTime(tx.createdAt)}</span>
                                                    <span>잔액 {formatPointAmount(tx.balanceAfter)}</span>
                                                </div>
                                            </div>
                                        ))}
                                        {filteredPointLedger.length === 0 && <p className="text-muted">내역이 없습니다.</p>}
                                    </div>
                                )}
                            </div>

                            <div className="glass-panel admin-points-panel">
                                <div className="section-title-row" style={{ marginBottom: '1rem' }}>
                                    <h3 className="section-title">잔액 상위 회원</h3>
                                    <span className="section-limit">{pointTopUsers.length}명</span>
                                </div>
                                <div className="admin-card-list">
                                    {pointTopUsers.map((row) => (
                                        <div key={row.id} className="admin-feed-card">
                                            <div className="admin-feed-head">
                                                <div>
                                                    <strong>{row.name}</strong>
                                                    <p className="text-muted admin-feed-sub">{row.email || '-'} · #{row.id}</p>
                                                </div>
                                                <span className="badge badge-gold">{formatPointAmount(row.pointBalance)}</span>
                                            </div>
                                            <p className="admin-feed-text">가입일 {formatDate(row.createdAt)}</p>
                                        </div>
                                    ))}
                                    {pointTopUsers.length === 0 && <p className="text-muted">표시할 회원이 없습니다.</p>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {adminTab === 'database' && (
                    <div className="admin-db-shell">
                        <div className="glass-panel admin-db-toolbar">
                            <div className="admin-db-toolbar-head">
                                <div>
                                    <h2 className="section-title">DB 상태</h2>
                                    <p className="admin-db-side-note" style={{ marginBottom: 0 }}>
                                        프리셋으로 전체 흐름을 보고, 필요하면 직접 기간을 지정해 비교합니다.
                                    </p>
                                </div>
                                <div className="admin-db-toolbar-info">
                                    <span className="badge badge-gold">{dashboard?.database.name || 'novelai_db'}</span>
                                    <span className="badge badge-green">{chartRangeLabel}</span>
                                </div>
                            </div>

                            <div className="admin-db-range-controls">
                                <div className="admin-db-range-presets">
                                    {(['24h', '7d', '30d'] as const).map((preset) => (
                                        <button
                                            key={preset}
                                            className={`admin-db-toggle-chip ${adminStatsPreset === preset ? 'is-active' : ''}`}
                                            onClick={() => void applyAdminPreset(preset)}
                                        >
                                            {preset === '24h' ? '24시간' : preset === '7d' ? '7일' : '30일'}
                                        </button>
                                    ))}
                                    <button
                                        className={`admin-db-toggle-chip ${adminStatsPreset === 'custom' ? 'is-active' : ''}`}
                                        onClick={() => setAdminStatsPreset('custom')}
                                    >
                                        직접 지정
                                    </button>
                                </div>

                                <div className="admin-db-range-inputs">
                                    <label>
                                        시작
                                        <input
                                            type="datetime-local"
                                            className="input-control"
                                            value={adminStatsStart}
                                            onChange={(e) => setAdminStatsStart(e.target.value)}
                                        />
                                    </label>
                                    <label>
                                        종료
                                        <input
                                            type="datetime-local"
                                            className="input-control"
                                            value={adminStatsEnd}
                                            onChange={(e) => setAdminStatsEnd(e.target.value)}
                                        />
                                    </label>
                                </div>

                                <div className="admin-db-range-actions">
                                    <button className="btn btn-primary" onClick={() => void applyAdminPeriod()}>
                                        기간 적용
                                    </button>
                                    <button
                                        className="btn btn-outline"
                                        onClick={() => {
                                            const presetRange = getPresetRange(adminStatsPreset === 'custom' ? '24h' : adminStatsPreset);
                                            setAdminStatsStart(presetRange.start);
                                            setAdminStatsEnd(presetRange.end);
                                        }}
                                    >
                                        초기화
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="admin-db-layout">
                            <div className="glass-panel admin-db-sidebar">
                                <p className="admin-db-side-note">
                                    기간을 바꾸면 통계와 그래프가 함께 바뀝니다.
                                </p>
                                <div className="admin-db-nav">
                                    {[
                                        { key: 'stats', label: '통계', desc: '운영 요약' },
                                        { key: 'graph', label: '그래프', desc: '회원 · 이야기 · 메시지 추이' },
                                        { key: 'distribution', label: '분포', desc: '회원 · 콘텐츠 비율' },
                                        { key: 'filters', label: '필터', desc: '표시 항목 선택' },
                                        { key: 'tables', label: '테이블', desc: 'DB 크기 정보' },
                                    ].map((item) => (
                                        <button
                                            key={item.key}
                                            className={`admin-db-nav-btn ${adminDatabaseView === item.key ? 'is-active' : ''}`}
                                            onClick={() => setAdminDatabaseView(item.key as AdminDatabaseView)}
                                        >
                                            <span>{item.label}</span>
                                            <small>{item.desc}</small>
                                        </button>
                                    ))}
                                </div>
                                <div className="admin-db-side-card">
                                    <span>선택 기간</span>
                                    <strong>{chartRangeLabel}</strong>
                                    <small>
                                        {selectedRange?.granularity === 'hour' ? '시간 단위' : '일 단위'} · 버킷 {formatCount(selectedRange?.granularity ? periodUsage.length : 0)}개
                                    </small>
                                </div>
                            </div>

                            <div className="admin-db-content">
                            {adminDatabaseError && (
                                <div className="admin-db-banner is-error">
                                    {adminDatabaseError}
                                </div>
                            )}
                            {adminDatabaseLoading && (
                                <div className="admin-db-banner">
                                    DB 통계를 불러오는 중입니다...
                                </div>
                            )}

                            {adminDatabaseView === 'stats' && (
                                <div className="glass-panel admin-db-panel admin-db-panel-scrollless">
                                    <div className="section-title-row">
                                        <h2 className="section-title">통계</h2>
                                        <span className="section-limit">{dashboard?.database.name || 'novelai_db'} · {chartRangeLabel}</span>
                                    </div>
                                    <div className="admin-db-stat-grid">
                                        {[
                                            { label: 'DB 용량', value: summary?.databaseSizeMb ?? 0, kind: 'kb' },
                                            { label: '총 회원', value: summary?.userCount ?? 0, kind: 'count' },
                                            { label: '총 이야기', value: summary?.storyCount ?? 0, kind: 'count' },
                                            { label: '총 메시지', value: summary?.messageCount ?? 0, kind: 'count' },
                                            { label: '선택 기간 회원', value: rangeSummary?.userCount ?? 0, kind: 'count' },
                                            { label: '선택 기간 이야기', value: rangeSummary?.storyCount ?? 0, kind: 'count' },
                                            { label: '선택 기간 메시지', value: rangeSummary?.messageCount ?? 0, kind: 'count' },
                                            { label: '버킷 수', value: rangeSummary?.bucketCount ?? 0, kind: 'count' },
                                            { label: '버킷당 평균', value: rangeSummary?.avgCountPerBucket ?? 0, kind: 'decimal' },
                                            { label: '활성 작성자', value: summary?.activeWriterCount ?? 0, kind: 'count' },
                                        ].map((card) => (
                                            <div key={card.label} className="admin-db-stat-card">
                                                <span>{card.label}</span>
                                                <strong>
                                                    {card.kind === 'kb'
                                                        ? `${Number(card.value || 0).toFixed(2)} MB`
                                                        : card.kind === 'decimal'
                                                            ? Number(card.value || 0).toFixed(2)
                                                            : formatCount(card.value as number)}
                                                </strong>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="admin-db-mini-grid">
                                        <div className="admin-db-mini-panel">
                                            <h3>선택 기간 요약</h3>
                                            <div className="admin-db-mini-list">
                                                <div className="admin-db-mini-row">
                                                    <span>회원</span>
                                                    <strong>{formatCount(rangeSummary?.userCount ?? 0)}</strong>
                                                </div>
                                                <div className="admin-db-mini-row">
                                                    <span>이야기</span>
                                                    <strong>{formatCount(rangeSummary?.storyCount ?? 0)}</strong>
                                                </div>
                                                <div className="admin-db-mini-row">
                                                    <span>메시지</span>
                                                    <strong>{formatCount(rangeSummary?.messageCount ?? 0)}</strong>
                                                </div>
                                                <div className="admin-db-mini-row">
                                                    <span>공개 이야기</span>
                                                    <strong>{formatCount(rangeSummary?.publicStoryCount ?? 0)}</strong>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="admin-db-mini-panel">
                                            <h3>활동 흐름</h3>
                                            <div className="admin-db-mini-list">
                                                <div className="admin-db-mini-row">
                                                    <span>스토리 소유자</span>
                                                    <strong>{formatCount(rangeSummary?.storyOwnerCount ?? 0)}</strong>
                                                </div>
                                                <div className="admin-db-mini-row">
                                                    <span>활성 작성자</span>
                                                    <strong>{formatCount(rangeSummary?.activeWriterCount ?? 0)}</strong>
                                                </div>
                                                <div className="admin-db-mini-row">
                                                    <span>버킷당 평균</span>
                                                    <strong>{Number(rangeSummary?.avgCountPerBucket ?? 0).toFixed(2)}</strong>
                                                </div>
                                                <div className="admin-db-mini-row">
                                                    <span>데이터 포인트</span>
                                                    <strong>{formatCount(periodUsage.length)}</strong>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {adminDatabaseView === 'graph' && (
                                <div className="glass-panel admin-db-panel admin-db-panel-scrollless">
                                    <div className="section-title-row">
                                        <h2 className="section-title">그래프</h2>
                                        <span className="section-limit">{chartRangeLabel}</span>
                                    </div>
                                    <div className="admin-db-chart-legend">
                                        {chartTotals.map((series) => (
                                            <button
                                                key={series.key}
                                                className={`admin-db-toggle-chip ${adminSeriesFilters[series.key] ? 'is-active' : ''}`}
                                                onClick={() => toggleAdminSeriesFilter(series.key)}
                                            >
                                                <span className="admin-db-chip-dot" style={{ background: series.color }} />
                                                <span>{series.label}</span>
                                                <strong>{formatCount(series.total)}</strong>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="admin-db-chart-shell">
                                        {periodUsage.length > 0 ? (
                                            <svg className="admin-db-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                                                {Array.from({ length: 5 }, (_, index) => {
                                                    const ratio = index / 4;
                                                    const y = chartPaddingTop + (chartInnerHeight * ratio);
                                                    const value = Math.round(chartMax * (1 - ratio));
                                                    return (
                                                        <g key={index}>
                                                            <line
                                                                x1={chartPaddingX}
                                                                y1={y}
                                                                x2={chartWidth - chartPaddingX}
                                                                y2={y}
                                                                className="admin-db-chart-grid"
                                                            />
                                                            <text x={14} y={y + 4} className="admin-db-chart-label">
                                                                {formatCount(value)}
                                                            </text>
                                                        </g>
                                                    );
                                                })}

                                                {chartPoints.map((series) => (
                                                    <path
                                                        key={series.key}
                                                        d={series.path}
                                                        className="admin-db-chart-line"
                                                        style={{ stroke: series.color }}
                                                    />
                                                ))}

                                                {chartPoints.map((series) => {
                                                    if (!periodUsage.length) return null;
                                                    const lastRow = periodUsage[periodUsage.length - 1];
                                                    const x = chartWidth - chartPaddingX;
                                                    const y = chartPaddingTop + chartInnerHeight - (getSeriesValue(lastRow, series.key) / chartMax) * chartInnerHeight;
                                                    return (
                                                        <circle
                                                            key={`${series.key}-dot`}
                                                            cx={x}
                                                            cy={y}
                                                            r="4.5"
                                                            fill={series.color}
                                                            stroke="rgba(12, 13, 17, 0.9)"
                                                            strokeWidth="2"
                                                        />
                                                    );
                                                })}

                                                {chartTicks.map((row, index) => {
                                                    const x = periodUsage.length <= 1
                                                        ? chartWidth / 2
                                                        : chartPaddingX + (chartInnerWidth * periodUsage.indexOf(row) / (periodUsage.length - 1));
                                                    const label = selectedRange?.granularity === 'hour' ? formatHourLabel(row.bucket) : formatDayLabel(row.bucket);
                                                    return (
                                                        <text key={`${row.bucket}-${index}`} x={x} y={chartHeight - 14} className="admin-db-chart-axis">
                                                            {label}
                                                        </text>
                                                    );
                                                })}
                                            </svg>
                                        ) : (
                                            <div className="admin-db-empty-state">
                                                선택된 기간에 데이터가 없습니다.
                                            </div>
                                        )}
                                    </div>
                                    <div className="admin-db-chart-note">
                                        {selectedRange?.preset === 'custom'
                                            ? '직접 지정한 기간의 회원 · 이야기 · 메시지 변화를 확인합니다.'
                                            : '프리셋을 바꾸면 바로 그래프가 갱신됩니다.'}
                                    </div>
                                </div>
                            )}

                            {adminDatabaseView === 'distribution' && (
                                <div className="glass-panel admin-db-panel admin-db-panel-scrollless">
                                    <div className="section-title-row">
                                        <h2 className="section-title">분포</h2>
                                        <span className="section-limit">회원 · 콘텐츠 · 작성 흐름</span>
                                    </div>
                                    <div className="admin-db-mini-grid">
                                        <div className="admin-db-mini-panel">
                                            <h3>회원 역할</h3>
                                            <div className="admin-db-mini-list">
                                                {(databaseStats?.roleCounts || []).map((row) => (
                                                    <div key={row.label} className="admin-db-mini-row">
                                                        <span>{row.label}</span>
                                                        <strong>{formatCount(row.value)}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="admin-db-mini-panel">
                                            <h3>회원 로그인</h3>
                                            <div className="admin-db-mini-list">
                                                {(databaseStats?.providerCounts || []).map((row) => (
                                                    <div key={row.label} className="admin-db-mini-row">
                                                        <span>{row.label}</span>
                                                        <strong>{formatCount(row.value)}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="admin-db-mini-panel">
                                            <h3>메시지 역할</h3>
                                            <div className="admin-db-mini-list">
                                                {(databaseStats?.messageRoleCounts || []).map((row) => (
                                                    <div key={row.label} className="admin-db-mini-row">
                                                        <span>{row.label}</span>
                                                        <strong>{formatCount(row.value)}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="admin-db-mini-panel">
                                            <h3>비율</h3>
                                            <div className="admin-db-mini-list">
                                                <div className="admin-db-mini-row">
                                                    <span>공개 이야기</span>
                                                    <strong>{formatPercent(databaseStats?.averages.publicStoryRate)}</strong>
                                                </div>
                                                <div className="admin-db-mini-row">
                                                    <span>프리미엄 회원</span>
                                                    <strong>{formatPercent(databaseStats?.averages.premiumRate)}</strong>
                                                </div>
                                                <div className="admin-db-mini-row">
                                                    <span>정지 회원</span>
                                                    <strong>{formatPercent(databaseStats?.averages.suspendedRate)}</strong>
                                                </div>
                                                <div className="admin-db-mini-row">
                                                    <span>활성 작성자</span>
                                                    <strong>{formatPercent(databaseStats?.averages.activeWriterRate)}</strong>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {adminDatabaseView === 'filters' && (
                                <div className="glass-panel admin-db-panel admin-db-panel-scrollless">
                                    <div className="section-title-row">
                                        <h2 className="section-title">필터</h2>
                                        <span className="section-limit">회원 / 이야기 / 메시지</span>
                                    </div>
                                    <div className="admin-db-filter-grid">
                                        {chartTotals.map((series) => (
                                            <button
                                                key={series.key}
                                                className={`admin-db-filter-card ${adminSeriesFilters[series.key] ? 'is-active' : ''}`}
                                                onClick={() => toggleAdminSeriesFilter(series.key)}
                                            >
                                                <div className="admin-db-filter-head">
                                                    <span className="admin-db-chip-dot" style={{ background: series.color }} />
                                                    <strong>{series.label}</strong>
                                                </div>
                                                <span className="admin-db-filter-value">{formatCount(series.total)}</span>
                                                <small>{adminSeriesFilters[series.key] ? '차트에 표시됨' : '차트에서 숨김'}</small>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="admin-db-note-grid">
                                        <div className="admin-db-side-card">
                                            <span>현재 표시</span>
                                            <strong>
                                                {chartSeries.filter((series) => adminSeriesFilters[series.key]).map((series) => series.label).join(' · ') || '없음'}
                                            </strong>
                                            <small>필터는 그래프와 함께 즉시 반영됩니다.</small>
                                        </div>
                                        <div className="admin-db-side-card">
                                            <span>선택 기간</span>
                                            <strong>{chartRangeLabel}</strong>
                                            <small>원하는 범위로 바꿔가며 비교할 수 있습니다.</small>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {adminDatabaseView === 'tables' && (
                                <div className="glass-panel admin-db-panel admin-db-panel-scrollless">
                                    <div className="section-title-row">
                                        <h2 className="section-title">테이블</h2>
                                        <span className="section-limit">{dashboard?.database.name || 'novelai_db'}</span>
                                    </div>
                                    <div className="admin-table-wrap">
                                        <table className="admin-table admin-db-table">
                                            <thead>
                                                <tr><th>테이블</th><th>예상 행수</th><th>크기</th></tr>
                                            </thead>
                                            <tbody>
                                                {(dashboard?.tableStats || []).map((row) => (
                                                    <tr key={row.tableName}>
                                                        <td>{row.tableName}</td>
                                                        <td>{formatCount(row.estimatedRows)}</td>
                                                        <td>{formatKb(row.sizeMb)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            </div>
                        </div>
                    </div>
                )}

                {adminStoryDetail && (
                    <div className="modal-overlay" onClick={() => setAdminStoryDetail(null)}>
                        <div className="modal-content admin-story-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="admin-story-modal-header">
                                <div>
                                    <div className="admin-story-modal-title">
                                        <ScrollText size={20} className="text-accent" />
                                        <h2>{adminStoryDetail.story.title}</h2>
                                    </div>
                                    <p className="text-muted admin-story-meta-line">
                                        <span className="admin-story-meta-text">{adminStoryDetail.story.authorName || '알 수 없음'}</span>
                                        <span className="admin-story-meta-dot">·</span>
                                        <span className="admin-story-meta-text">{adminStoryDetail.story.authorEmail || '-'}</span>
                                        <span className="admin-story-meta-dot">·</span>
                                        <span className={`admin-story-meta-status ${adminStoryDetail.story.isPublic ? 'is-public' : 'is-private'}`}>
                                            {resolveStoryVisibilityInfo({
                                                isPublic: adminStoryDetail.story.isPublic,
                                                publicStatus: adminStoryDetail.story.publicStatus || null,
                                                publicMethod: adminStoryDetail.story.publicMethod || null,
                                            }).label}
                                        </span>
                                    </p>
                                </div>
                                <button className="btn btn-outline" onClick={() => setAdminStoryDetail(null)}>닫기</button>
                            </div>

                            <div className="admin-story-modal-badges">
                                <span className={`badge ${resolveStoryVisibilityInfo({
                                    isPublic: adminStoryDetail.story.isPublic,
                                    publicStatus: adminStoryDetail.story.publicStatus || null,
                                    publicMethod: adminStoryDetail.story.publicMethod || null,
                                }).badge}`}>
                                    {resolveStoryVisibilityInfo({
                                        isPublic: adminStoryDetail.story.isPublic,
                                        publicStatus: adminStoryDetail.story.publicStatus || null,
                                        publicMethod: adminStoryDetail.story.publicMethod || null,
                                    }).label}
                                </span>
                                <span className="badge badge-green">인물 {adminStoryDetail.characters.length}명</span>
                                <span className="badge badge-gold">메시지 {adminStoryDetail.messages.length}건</span>
                            </div>

                            <div className="admin-story-detail-grid">
                                <div className="admin-story-detail-panel">
                                    <h3>기본 정보</h3>
                                    <div className="admin-story-detail-meta">
                                        <div><span>작성자</span><strong>{adminStoryDetail.story.authorName || '-'}</strong></div>
                                        <div><span>이메일</span><strong>{adminStoryDetail.story.authorEmail || '-'}</strong></div>
                                        <div><span>수정일</span><strong>{formatDateTime(adminStoryDetail.story.updatedAt)}</strong></div>
                                        <div><span>생성일</span><strong>{formatDateTime(adminStoryDetail.story.createdAt)}</strong></div>
                                    </div>
                                    <div className="admin-story-block">
                                        <h4>배경</h4>
                                        <p>{adminStoryDetail.story.background || '미설정'}</p>
                                    </div>
                                    <div className="admin-story-block">
                                        <h4>환경</h4>
                                        <p>{adminStoryDetail.story.environment || '미설정'}</p>
                                    </div>
                                    <div className="admin-story-block">
                                        <h4>뷰어 설정</h4>
                                        <pre>{JSON.stringify(adminStoryDetail.story.viewerSettings || {}, null, 2)}</pre>
                                    </div>
                                </div>

                                <div className="admin-story-detail-panel">
                                    <h3>등장인물</h3>
                                    <div className="admin-detail-list">
                                        {adminStoryDetail.characters.map((char, index) => (
                                            <div key={`${char.name}-${index}`} className="admin-detail-item">
                                                <div className="admin-detail-item-head">
                                                    <strong>{char.name || `인물 ${index + 1}`}</strong>
                                                    <span className="badge badge-green">{char.relationship || 'friend'}</span>
                                                </div>
                                                <p className="text-muted admin-detail-mini">
                                                    {char.job || '직업 미설정'} · {char.age || '나이 미설정'} · {char.gender || 'other'}
                                                </p>
                                                <p className="admin-detail-text">{char.background || '개요 없음'}</p>
                                            </div>
                                        ))}
                                        {adminStoryDetail.characters.length === 0 && <p className="text-muted">등장인물이 없습니다.</p>}
                                    </div>
                                </div>
                            </div>

                            <div className="admin-story-detail-panel" style={{ marginTop: '1rem' }}>
                                <h3>최근 메시지</h3>
                                <div className="admin-detail-list admin-detail-scroll">
                                    {adminStoryDetail.messages.slice(-6).map((message) => (
                                        <div key={message.id} className="admin-detail-item">
                                            <div className="admin-detail-item-head">
                                                <strong>{message.authorName || (message.role === 'assistant' ? 'AI' : '사용자')}</strong>
                                                <span className={`badge ${message.role === 'assistant' ? 'badge-green' : 'badge-gold'}`}>
                                                    {message.role === 'assistant' ? 'AI' : '사용자'}
                                                </span>
                                            </div>
                                            <p className="text-muted admin-detail-mini">{formatDateTime(message.createdAt)}</p>
                                            <p className="admin-detail-text">{message.content}</p>
                                        </div>
                                    ))}
                                    {adminStoryDetail.messages.length === 0 && <p className="text-muted">메시지가 없습니다.</p>}
                                </div>
                            </div>

                            <div className="admin-story-modal-actions">
                                <button
                                    className="btn btn-outline"
                                    onClick={() => void toggleAdminStoryVisibility(adminStoryDetail.story.id, !adminStoryDetail.story.isPublic)}
                                    disabled={adminMutation === `story:${adminStoryDetail.story.id}:visibility`}
                                >
                                    {adminStoryDetail.story.isPublic ? '비공개로 전환' : '공개로 전환'}
                                </button>
                                <button
                                    className="btn btn-outline is-danger"
                                    onClick={() => void deleteAdminStoryById(adminStoryDetail.story.id)}
                                    disabled={adminMutation === `story:${adminStoryDetail.story.id}:delete`}
                                >
                                    이야기 삭제
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {adminPointUserDetail && (
                    <div className="modal-overlay" onClick={closeAdminPointUserDetail}>
                        <div className="modal-content admin-point-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="admin-story-modal-header">
                                <div>
                                    <div className="admin-story-modal-title">
                                        <Coins size={20} className="text-accent" />
                                        <h2>{adminPointUserDetail.user.name}</h2>
                                    </div>
                                    <p className="text-muted admin-story-meta-line">
                                        <span className="admin-story-meta-text">{adminPointUserDetail.user.email || '-'}</span>
                                        <span className="admin-story-meta-dot">·</span>
                                        <span className="admin-story-meta-text">{adminPointUserDetail.user.provider}</span>
                                        <span className="admin-story-meta-dot">·</span>
                                        <span className={`badge ${adminPointUserDetail.user.role === 'admin' ? 'badge-red' : 'badge-green'}`}>
                                            {adminPointUserDetail.user.role}
                                        </span>
                                    </p>
                                </div>
                                <div className="admin-point-header-actions">
                                    {adminPointUserView === 'ledger' ? (
                                        <button className="btn btn-outline" onClick={() => setAdminPointUserView('summary')}>
                                            회원 상세로
                                        </button>
                                    ) : (
                                        <button
                                            className="btn btn-outline"
                                            onClick={() => {
                                                setAdminPointLedgerPage(0);
                                                setAdminPointUserView('ledger');
                                            }}
                                        >
                                            포인트 내역 조회
                                        </button>
                                    )}
                                    <button className="btn btn-outline" onClick={closeAdminPointUserDetail}>닫기</button>
                                </div>
                            </div>

                            <div className="admin-story-modal-badges">
                                <span className="badge badge-gold">잔액 {formatPointAmount(adminPointUserDetail.user.pointBalance)}</span>
                                <span className="badge badge-green">{adminPointUserDetail.storyCount}개 이야기</span>
                                <span className={`badge ${adminPointUserDetail.user.isSuspended ? 'badge-red' : 'badge-green'}`}>
                                    {adminPointUserDetail.user.isSuspended ? '정지' : '정상'}
                                </span>
                            </div>

                            {adminPointUserView === 'summary' ? (
                                <>
                                    <div className="admin-point-grid">
                                        <div className="admin-point-panel">
                                            <h3>회원 정보</h3>
                                            <div className="admin-story-detail-meta">
                                                <div><span>가입일</span><strong>{formatDateTime(adminPointUserDetail.user.createdAt)}</strong></div>
                                                <div><span>휴대폰</span><strong>{adminPointUserDetail.user.phoneNumber || '미등록'}</strong></div>
                                                <div><span>본인 인증</span><strong>{adminPointUserDetail.user.phoneVerifiedAt ? '완료' : '미완료'}</strong></div>
                                                <div><span>성인 인증</span><strong>{adminPointUserDetail.user.isAdult ? '완료' : '미완료'}</strong></div>
                                                <div><span>성인 인증일</span><strong>{adminPointUserDetail.user.adultVerifiedAt ? formatDateTime(adminPointUserDetail.user.adultVerifiedAt) : '-'}</strong></div>
                                                <div><span>프리미엄</span><strong>{adminPointUserDetail.user.isPremium ? '사용 중' : '일반'}</strong></div>
                                                <div><span>공개 권한</span><strong>{adminPointUserDetail.user.canPublishCommunity ? '허용' : '비허용'}</strong></div>
                                            </div>
                                            <div className="admin-point-actions">
                                                <button
                                                    className="btn btn-outline"
                                                    onClick={() => void updateAdminUserStatus(adminPointUserDetail.user.id, { isPremium: !adminPointUserDetail.user.isPremium })}
                                                    disabled={adminPointUserDetail.user.role === 'admin' || adminMutation === `user:${adminPointUserDetail.user.id}`}
                                                >
                                                    {adminPointUserDetail.user.isPremium ? '프리미엄 끄기' : '프리미엄 켜기'}
                                                </button>
                                                <button
                                                    className="btn btn-outline"
                                                    onClick={() => void updateAdminUserStatus(adminPointUserDetail.user.id, { canPublishCommunity: !adminPointUserDetail.user.canPublishCommunity })}
                                                    disabled={adminPointUserDetail.user.role === 'admin' || adminMutation === `user:${adminPointUserDetail.user.id}`}
                                                >
                                                    {adminPointUserDetail.user.canPublishCommunity ? '공개권한 회수' : '공개권한 부여'}
                                                </button>
                                                <button
                                                    className="btn btn-outline is-danger"
                                                    onClick={() => void updateAdminUserStatus(adminPointUserDetail.user.id, { isSuspended: !adminPointUserDetail.user.isSuspended })}
                                                    disabled={adminPointUserDetail.user.role === 'admin' || adminMutation === `user:${adminPointUserDetail.user.id}`}
                                                >
                                                    {adminPointUserDetail.user.isSuspended ? '정지 해제' : '정지'}
                                                </button>
                                            </div>
                                            {adminPointUserDetail.user.role === 'admin' && (
                                                <p className="input-help" style={{ marginTop: '0.75rem' }}>
                                                    관리자 계정은 권한 변경과 포인트 조정이 제한됩니다.
                                                </p>
                                            )}
                                        </div>

                                        <div className="admin-point-panel">
                                            <h3>포인트 조정</h3>
                                            <div className="input-group">
                                                <label>변경 포인트 (+ / -)</label>
                                                <input
                                                    className="input-control"
                                                    value={adminPointAdjustment}
                                                    onChange={(e) => setAdminPointAdjustment(e.target.value)}
                                                    placeholder="예: 100 또는 -50"
                                                    disabled={adminPointUserDetail.user.role === 'admin'}
                                                />
                                            </div>
                                            <div className="input-group">
                                                <label>사유</label>
                                                <textarea
                                                    className="input-control"
                                                    value={adminPointAdjustmentNote}
                                                    onChange={(e) => setAdminPointAdjustmentNote(e.target.value)}
                                                    placeholder="포인트 지급/회수/수정 사유를 남겨주세요."
                                                    disabled={adminPointUserDetail.user.role === 'admin'}
                                                />
                                            </div>
                                            <button
                                                className="btn btn-primary"
                                                style={{ width: '100%', justifyContent: 'center' }}
                                                onClick={() => void handleAdminPointAdjustment()}
                                                disabled={adminPointUserDetail.user.role === 'admin' || adminMutation === `point:${adminPointUserDetail.user.id}`}
                                            >
                                                <CircleDollarSign size={16} /> 저장하기
                                            </button>
                                            <div style={{ marginTop: '1rem' }}>
                                                <div className="section-title-row" style={{ marginBottom: '0.7rem' }}>
                                                    <h3 className="section-title">최근 포인트 내역</h3>
                                                    <span className="section-limit">최근 5건</span>
                                                </div>
                                                <div className="admin-detail-list">
                                                    {adminPointUserDetail.recentTransactions.slice(0, 5).map((tx) => (
                                                        <div key={tx.id} className="admin-detail-item">
                                                <div className="admin-detail-item-head">
                                                    <strong>{formatPointTransactionTypeLabel(tx.transactionType)}</strong>
                                                    <span className={tx.amount >= 0 ? 'text-positive' : 'text-negative'}>
                                                        {tx.amount >= 0 ? '+' : ''}{formatPointAmount(tx.amount)}
                                                    </span>
                                                </div>
                                                            <p className="text-muted admin-detail-mini">
                                                                {formatDateTime(tx.createdAt)} · 잔액 {formatPointAmount(tx.balanceAfter)}
                                                            </p>
                                                            <p className="admin-detail-text">{tx.note || '메모 없음'}</p>
                                                        </div>
                                                    ))}
                                                    {adminPointUserDetail.recentTransactions.length === 0 && <p className="text-muted">최근 내역이 없습니다.</p>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="admin-point-ledger-shell">
                                    <div className="admin-point-ledger-toolbar">
                                        <div>
                                            <h3>포인트 내역 조회</h3>
                                            <p className="text-muted" style={{ marginTop: '0.25rem' }}>
                                                스크롤 없이 페이지 단위로 확인할 수 있습니다.
                                            </p>
                                        </div>
                                        <div className="admin-point-ledger-nav">
                                            <button
                                                className="btn btn-outline"
                                                onClick={() => setAdminPointLedgerPage((page) => Math.max(0, page - 1))}
                                                disabled={adminPointLedgerPage === 0}
                                            >
                                                이전
                                            </button>
                                            <span className="badge badge-gold">
                                                {pointLedgerPage + 1} / {pointLedgerTotalPages}
                                            </span>
                                            <button
                                                className="btn btn-outline"
                                                onClick={() => setAdminPointLedgerPage((page) => Math.min(pointLedgerTotalPages - 1, page + 1))}
                                                disabled={pointLedgerPage >= pointLedgerTotalPages - 1}
                                            >
                                                다음
                                            </button>
                                        </div>
                                    </div>

                                    <div className="admin-point-ledger-summary">
                                        <span className="badge badge-gold">잔액 {formatPointAmount(adminPointUserDetail.user.pointBalance)}</span>
                                        <span className="badge badge-green">{adminPointUserDetail.recentTransactions.length}건</span>
                                    </div>

                                    <div className="admin-point-ledger-grid">
                                        {visiblePointLedger.map((tx) => (
                                            <div key={tx.id} className="admin-point-ledger-card">
                                            <div className="admin-point-ledger-card-head">
                                                    <strong>{formatPointTransactionTypeLabel(tx.transactionType)}</strong>
                                                    <span className={tx.amount >= 0 ? 'text-positive' : 'text-negative'}>
                                                        {tx.amount >= 0 ? '+' : ''}{formatPointAmount(tx.amount)}
                                                    </span>
                                                </div>
                                                <p className="text-muted admin-detail-mini">
                                                    {formatDateTime(tx.createdAt)} · 잔액 {formatPointAmount(tx.balanceAfter)}
                                                </p>
                                                <p className="admin-detail-text">{tx.note || '메모 없음'}</p>
                                                <p className="admin-point-ledger-meta">
                                                    <span>종류 {tx.referenceType || '-'}</span>
                                                    <span>기준 {tx.referenceId ?? '-'}</span>
                                                </p>
                                            </div>
                                        ))}
                                        {visiblePointLedger.length === 0 && <p className="text-muted">표시할 내역이 없습니다.</p>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="app-layout">
            {renderNav()}
            {view === 'login' && renderLogin()}
            {view === 'home' && renderHome()}
            {view === 'community' && renderCommunity()}
            {view === 'studio' && renderStudio()}
            {view === 'chat' && renderChat()}
            {view === 'binding' && renderBinding()}
            {view === 'points' && renderPoints()}
            {view === 'profile' && renderProfile()}
            {view === 'admin' && renderAdmin()}
        </div>
    );
}
