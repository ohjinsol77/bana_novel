import { useState, useEffect, useRef } from 'react';
import {
    Plus, Settings, Trash2, LogOut,
    ShieldAlert, CreditCard, ChevronLeft, Send, Sparkles,
    BookOpen, Globe, Lock, Users, RefreshCw
} from 'lucide-react';
import {
    fetchMe, fetchStories, createStory, updateStory,
    deleteStory, fetchStoryMessages, sendStoryMessage, clearStoryMessages,
    fetchAllUsers, oauthUrl, updateStorySettings
} from './api';
import './index.css';

// ── Types ───────────────────────────────────────────────────
interface AuthUser {
    id: number; name: string; email: string; role: 'user' | 'admin';
    is_adult: boolean; is_premium: boolean;
}

export interface StoryCharacter {
    id?: number;
    story_id?: number;
    name: string;
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
    created_at: string;
    updated_at: string;
    characters: StoryCharacter[]; // Joined from backend
    viewer_settings?: any;
}

export interface StoryMessage {
    id: number;
    story_id: number;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
}

const MAX_CHARACTERS = 7;
const LONG_TEXT_LIMIT = 1500;
const PERSONALITY_LIMIT = 5;
const SPEECH_STYLE_LIMIT = 3;
const LIKES_LIMIT = 5;

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
    { label: '사용자에게 공감한다', value: 'show_empathy' },
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
    { label: '사용자와 친해지기', value: 'build_friendship' },
    { label: '재미있는 대화', value: 'fun_conversation' },
    { label: '도움 주기', value: 'provide_help' },
    { label: '정보 제공', value: 'provide_information' },
    { label: '감정 교류', value: 'emotional_support' },
];

function createEmptyCharacter(): StoryCharacter {
    return {
        name: '',
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

// ── App ─────────────────────────────────────────────────────
export default function App() {
    const [user, setUser] = useState<AuthUser | null>({ id: 1, name: '손님', email: 'guest@example.com', role: 'user', is_adult: false, is_premium: false });
    const [view, setView] = useState<'login' | 'home' | 'studio' | 'chat' | 'admin'>('home');
    const [stories, setStories] = useState<Story[]>([]);
    const [activeStory, setActiveStory] = useState<Story | null>(null);
    const [storyMessages, setStoryMessages] = useState<StoryMessage[]>([]);
    const [msgInput, setMsgInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [adminUsers, setAdminUsers] = useState<unknown[]>([]);
    const [editMode, setEditMode] = useState<'new' | 'edit'>('new');
    const chatBottomRef = useRef<HTMLDivElement>(null);

    // Reader Settings (Restored)
    const [readerSettings, setReaderSettings] = useState({
        aspectRatio: 'tall' as 'full' | 'wide' | 'standard' | 'tall',
        fontFamily: 'Gowun Batang',
        fontSize: 18,
        lineHeight: 1.8,
        showBackground: true,
        userColorR: 156, userColorG: 163, userColorB: 175,
        aiColorR: 226, aiColorG: 220, aiColorB: 200,
    });
    const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
    const [sliderValue, setSliderValue] = useState(0);

    const bookRef = useRef<HTMLDivElement>(null);

    // Story form
    const [form, setForm] = useState<Partial<Story>>({
        title: '', background: '', environment: '', is_public: false,
        characters: []
    });

    const navigate = (newView: 'login' | 'home' | 'studio' | 'chat' | 'admin') => {
        if (newView !== view) {
            window.history.pushState({ view: newView }, '', `/${newView === 'home' ? '' : newView}`);
            setView(newView);
        }
    };

    // ── Bootstrap: read token from URL or localStorage ──────
    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            if (e.state && e.state.view) {
                setView(e.state.view);
            } else {
                const path = window.location.pathname.replace('/', '') || 'home';
                setView(path as any);
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
            const initialView = window.history.state?.view || (window.location.pathname.replace('/', '') || 'home');
            if (me) {
                setUser(me);
                setView(initialView as any);
                loadStories();
            } else {
                setView('home');
                loadStories();
            }
        });

        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const isInitialChatLoad = useRef(false);

    useEffect(() => {
        // Auto-scroll when new messages arrive
        if (!bookRef.current) return;
        const container = bookRef.current;
        const behaviorOpt = isInitialChatLoad.current ? 'auto' : 'smooth';

        if (readerSettings.aspectRatio === 'tall') {
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
    }, [storyMessages, readerSettings.aspectRatio]);

    // Save reader settings to DB debounced
    useEffect(() => {
        if (!activeStory || view !== 'chat') return;
        const timer = setTimeout(() => {
            updateStorySettings(activeStory.id, readerSettings).catch(e => console.error('Failed to save settings:', e));
        }, 1000);
        return () => clearTimeout(timer);
    }, [readerSettings, activeStory, view]);

    // ── Handlers ─────────────────────────────────────────────
    const loadStories = async () => {
        try {
            const data = await fetchStories();
            setStories(data.map(normalizeStoryForClient));
        } catch (err: any) {
            console.error('Load stories failed:', err);
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        navigate('login');
    };

    const openNewStory = () => {
        setActiveStory(null);
        setForm({ title: '', background: '', environment: '', is_public: false, characters: [] });
        setEditMode('new');
        navigate('studio');
    };

    const openEditStory = (story: Story) => {
        const normalizedStory = normalizeStoryForClient(story);
        setForm({
            title: normalizedStory.title, background: normalizedStory.background, environment: normalizedStory.environment,
            is_public: normalizedStory.is_public, characters: normalizedStory.characters || []
        });
        setActiveStory(normalizedStory);
        setEditMode('edit');
        navigate('studio');
    };

    const saveStory = async () => {
        if (!form.title?.trim()) { alert('이야기 제목을 입력하세요'); return; }
        if (form.characters && form.characters.length > 7) { alert('등장인물은 최대 7명까지만 가능합니다.'); return; }

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
        } catch (err: any) {
            console.error('Save failed:', err);
            alert(`저장 실패: ${err.message}`);
        }
    };

    const removeStory = async (id: number) => {
        if (!confirm('이야기와 속한 등장인물, 소설 기록이 모두 삭제됩니다. 정말 삭제할까요?')) return;
        await deleteStory(id);
        await loadStories();
    };

    const openStoryReader = async (story: Story) => {
        try {
            const normalizedStory = normalizeStoryForClient(story);
            setActiveStory(normalizedStory);
            if (normalizedStory.viewer_settings) {
                // Merge loaded settings with current defaults in case new fields were added
                setReaderSettings(prev => ({ ...prev, ...normalizedStory.viewer_settings }));
            }
            const history = await fetchStoryMessages(normalizedStory.id);
            setStoryMessages(history);
            isInitialChatLoad.current = true;
            navigate('chat'); // chat view is actually the reader
        } catch (err: any) {
            console.error('Open reader failed:', err);
            alert(`집필 창을 열 수 없습니다: ${err.message}`);
        }
    };

    const handleSend = async () => {
        if (!msgInput.trim() || !activeStory || isSending) return;
        const content = msgInput;
        const userMessageId = Date.now();
        setMsgInput('');
        setIsSending(true);
        setStoryMessages(prev => [...prev, { id: userMessageId, story_id: activeStory.id, role: 'user', content, created_at: '' }]);

        try {
            const reply = await sendStoryMessage(activeStory.id, content);
            setStoryMessages(prev => [...prev, { id: reply.id ?? Date.now() + 1, story_id: activeStory.id, role: 'assistant', content: reply.content, created_at: '' }]);
        } catch (err: any) {
            console.error('집필 전송 실패:', err);
            const errorMessage = err?.message || '알 수 없는 오류';
            setStoryMessages(prev => [
                ...prev,
                {
                    id: Date.now() + 1,
                    story_id: activeStory.id,
                    role: 'assistant',
                    content: `[오류] 집필 요청 실패: ${errorMessage}`,
                    created_at: ''
                }
            ]);
        } finally {
            setIsSending(false);
        }
    };

    const handleClearChat = async () => {
        if (!activeStory || !confirm('집필 기록을 전부 삭제할까요?')) return;
        await clearStoryMessages(activeStory.id);
        setStoryMessages([]);
    };

    // ── Reader Logic (Restored) ──────────────────────────────
    const scrollPage = (direction: 'next' | 'prev') => {
        if (!bookRef.current) return;
        const container = bookRef.current;
        const isTall = readerSettings.aspectRatio === 'tall';

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
        if (readerSettings.aspectRatio === 'tall') {
            return Math.max(1, container.scrollHeight - container.clientHeight);
        }
        return Math.max(1, container.scrollWidth - container.clientWidth);
    };

    const handleSlider = (val: number) => {
        setSliderValue(val);
        if (!bookRef.current) return;
        const container = bookRef.current;
        if (readerSettings.aspectRatio === 'tall') {
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

    const openAdmin = async () => {
        const users = await fetchAllUsers();
        setAdminUsers(users);
        navigate('admin');
    };

    // ── Render helpers ───────────────────────────────────────
    const renderNav = () => (
        <nav className="top-nav">
            <div className="nav-brand" onClick={() => view !== 'login' && navigate('home')}>
                <BookOpen size={24} className="text-accent" />
                <span>Bana<span className="text-accent">Novel 🍌</span></span>
            </div>
            {user && (
                <div className="nav-actions">
                    {user.role === 'admin' && (
                        <button className="btn btn-outline" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }} onClick={openAdmin}>
                            <ShieldAlert size={16} /> 관리자
                        </button>
                    )}
                    {!user.is_premium && (
                        <button className="btn btn-outline" style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                            <CreditCard size={16} /> 프리미엄
                        </button>
                    )}
                    <span className="text-muted" style={{ fontSize: '0.9rem' }}>{user.name}</span>
                    <button className="btn-icon" onClick={logout}><LogOut size={20} /></button>
                </div>
            )}
        </nav>
    );

    // ── Login view ───────────────────────────────────────────
    const renderLogin = () => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
            <div className="glass-panel" style={{ width: 380, textAlign: 'center', padding: '3rem' }}>
                <BookOpen size={48} className="text-accent" style={{ margin: '0 auto 1.5rem' }} />
                <h1 className="title-font" style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>
                    Novel<span className="text-accent">AI</span>
                </h1>
                <p className="text-muted" style={{ marginBottom: '2.5rem' }}>
                    나만의 AI 캐릭터를 만들고 대화하세요
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <a href={oauthUrl.kakao} className="btn" style={{ background: '#FEE500', color: '#3C1E1E', justifyContent: 'center', fontWeight: 600 }}>
                        카카오로 로그인
                    </a>
                    <a href={oauthUrl.naver} className="btn" style={{ background: '#03C75A', color: 'white', justifyContent: 'center', fontWeight: 600 }}>
                        네이버로 로그인
                    </a>
                    <a href={oauthUrl.google} className="btn" style={{ background: 'white', color: '#333', justifyContent: 'center', fontWeight: 600, border: '1px solid #ddd' }}>
                        구글로 로그인
                    </a>
                </div>

                <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: '2rem', lineHeight: 1.5 }}>
                    로그인 시 서비스 이용약관 및 개인정보처리방침에 동의하게 됩니다.
                </p>
            </div>
        </div>
    );

    // ── Home: story list ─────────────────────────────────
    const renderHome = () => (
        <div className="main-content fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 className="title-font" style={{ fontSize: '1.8rem' }}>나의 소설</h1>
                    <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                        새로운 세계관과 인물들을 만들고 이야기를 집필하세요
                    </p>
                </div>
                <button className="btn btn-primary" onClick={openNewStory}>
                    <Plus size={18} /> 새 이야기
                </button>
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
                                    {story.is_public ? <Globe size={14} className="text-muted" /> : <Lock size={14} className="text-muted" />}
                                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>{story.is_public ? '공개' : '비공개'}</span>
                                </div>
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
        </div>
    );

    // ── Studio: story & character creation/edit ──────────────────────
    const renderStudio = () => {
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
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={form.is_public}
                                    onChange={e => setForm({ ...form, is_public: e.target.checked })} />
                                공개 소설 (다른 유저에게 공개)
                            </label>
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
                                    <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--accent)' }}>등장인물 {index + 1}</h3>

                                    <div className="character-section">
                                        <h4 className="section-title">기본 정보</h4>
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
                                            <h4 className="section-title">성격</h4>
                                            <span className="section-limit">최대 {PERSONALITY_LIMIT}개 선택</span>
                                        </div>
                                        {renderChoiceGroup(index, 'personality', PERSONALITY_OPTIONS, PERSONALITY_LIMIT, '성격')}
                                    </div>

                                    <div className="character-section">
                                        <div className="section-title-row">
                                            <h4 className="section-title">말투 스타일</h4>
                                            <span className="section-limit">최대 {SPEECH_STYLE_LIMIT}개 선택</span>
                                        </div>
                                        {renderChoiceGroup(index, 'speechStyles', SPEECH_STYLE_OPTIONS, SPEECH_STYLE_LIMIT, '말투 스타일')}
                                    </div>

                                    <div className="character-section">
                                        <h4 className="section-title">행동 규칙</h4>
                                        <div className="input-group">
                                            {renderChoiceGroup(index, 'behaviorRules', BEHAVIOR_RULE_OPTIONS, BEHAVIOR_RULE_OPTIONS.length, '행동 규칙')}
                                        </div>
                                        <div className="input-group" style={{ marginBottom: 0 }}>
                                            <label>기타 행동 규칙</label>
                                            <textarea
                                                className="input-control"
                                                maxLength={LONG_TEXT_LIMIT}
                                                placeholder="예: 사용자가 힘들어 보이면 먼저 안부를 묻고 대화를 부드럽게 이끈다."
                                                value={char.customBehaviorRules}
                                                onChange={e => handleLongTextChange(index, 'customBehaviorRules', e.target.value)}
                                            />
                                            {renderLongTextCounter(char.customBehaviorRules)}
                                        </div>
                                    </div>

                                    <div className="character-section">
                                        <div className="section-title-row">
                                            <h4 className="section-title">취미 / 좋아하는 것</h4>
                                            <span className="section-limit">최대 {LIKES_LIMIT}개 선택</span>
                                        </div>
                                        {renderChoiceGroup(index, 'likes', LIKE_OPTIONS, LIKES_LIMIT, '좋아하는 것')}
                                    </div>

                                    <div className="character-section">
                                        <h4 className="section-title">싫어하는 것</h4>
                                        <div className="input-group">
                                            {renderChoiceGroup(index, 'dislikes', DISLIKE_OPTIONS, DISLIKE_OPTIONS.length, '싫어하는 것')}
                                        </div>
                                        <div className="input-group" style={{ marginBottom: 0 }}>
                                            <label>직접 입력</label>
                                            <textarea
                                                className="input-control"
                                                maxLength={LONG_TEXT_LIMIT}
                                                placeholder="예: 일방적으로 무시당하는 상황, 예의 없는 농담"
                                                value={char.customDislikes}
                                                onChange={e => handleLongTextChange(index, 'customDislikes', e.target.value)}
                                            />
                                            {renderLongTextCounter(char.customDislikes)}
                                        </div>
                                    </div>

                                    <div className="character-section">
                                        <h4 className="section-title">사용자와 관계</h4>
                                        {renderSingleChoiceGroup(index, 'relationship', RELATIONSHIP_OPTIONS)}
                                    </div>

                                    <div className="character-section">
                                        <h4 className="section-title">캐릭터 목표</h4>
                                        <div className="input-group">
                                            {renderChoiceGroup(index, 'goals', GOAL_OPTIONS, GOAL_OPTIONS.length, '캐릭터 목표')}
                                        </div>
                                        <div className="input-group" style={{ marginBottom: 0 }}>
                                            <label>직접 입력</label>
                                            <textarea
                                                className="input-control"
                                                maxLength={LONG_TEXT_LIMIT}
                                                placeholder="예: 사용자가 자신감을 되찾을 수 있도록 꾸준히 응원한다."
                                                value={char.customGoals}
                                                onChange={e => handleLongTextChange(index, 'customGoals', e.target.value)}
                                            />
                                            {renderLongTextCounter(char.customGoals)}
                                        </div>
                                    </div>

                                    <div className="character-section" style={{ marginBottom: 0 }}>
                                        <h4 className="section-title">캐릭터 배경</h4>
                                        <div className="input-group" style={{ marginBottom: 0 }}>
                                            <label>캐릭터 설명</label>
                                            <textarea
                                                className="input-control"
                                                maxLength={LONG_TEXT_LIMIT}
                                                placeholder={'예)\n게임 스트리머로 활동하며\n사용자와 즐겁게 대화하는 것을 좋아한다.'}
                                                value={char.background}
                                                onChange={e => handleLongTextChange(index, 'background', e.target.value)}
                                            />
                                            <p className="input-help">예) 게임 스트리머로 활동하며 사용자와 즐겁게 대화하는 것을 좋아한다.</p>
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
        const userColorStr = `rgb(${readerSettings.userColorR}, ${readerSettings.userColorG}, ${readerSettings.userColorB})`;
        const aiColorStr = `rgb(${readerSettings.aiColorR}, ${readerSettings.aiColorG}, ${readerSettings.aiColorB})`;

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

        return (
            <div className="chat-layout fade-in" style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div className="chat-header glass-panel" style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border-color)' }}>
                    <div className="flex items-center gap-4">
                        <button className="btn-icon" onClick={() => navigate('home')}><ChevronLeft size={22} /></button>
                        <div className="font-bold flex items-center gap-2" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>
                            <BookOpen size={20} />
                            {activeStory?.title}
                        </div>
                    </div>
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
                                    <label>화면 비율</label>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        {(['full', 'wide', 'standard', 'tall'] as const).map(r => (
                                            <button key={r} className={`btn btn-outline ${readerSettings.aspectRatio === r ? 'active' : ''}`}
                                                style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', borderColor: readerSettings.aspectRatio === r ? 'var(--accent)' : '' }}
                                                onClick={() => setReaderSettings({ ...readerSettings, aspectRatio: r })}>
                                                {r === 'full' ? '풀스크린' : r === 'wide' ? '와이드' : r === 'standard' ? '표준' : '세로집중'}
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
                                        AI 집필 색상 (RGB)
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
                                        배경 이미지 표시
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Book Reader View (Restored) */}
                <div className="book-container" style={{ flex: 1, position: 'relative', background: '#0c0d11' }}>
                    <button className="book-nav-btn prev" onClick={() => scrollPage('prev')} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }}>
                        <ChevronLeft size={48} />
                    </button>

                    <div className={`book-pages ratio-${readerSettings.aspectRatio} ${readerSettings.showBackground ? 'has-background-inner' : ''}`}>
                        {readerSettings.aspectRatio === 'tall' ? (
                            <div className="book-text-tall" ref={bookRef} style={{
                                fontFamily: readerSettings.fontFamily, fontSize: `${readerSettings.fontSize}px`, lineHeight: readerSettings.lineHeight
                            }}>
                                {storyMessages.length === 0 && (
                                    <div style={{ opacity: 0.8, textAlign: 'center', margin: '3rem 0', fontStyle: 'italic' }}>
                                        새로운 이야기가 시작됩니다. 지시를 입력하거나 캐릭터의 대사를 작성해 보세요.
                                    </div>
                                )}
                                {storyMessages.map(msg => (
                                    <p key={msg.id} style={{ marginBottom: '1.5rem', textAlign: 'justify' }}>
                                        {msg.role === 'user' ? (
                                            <span style={{ color: userColorStr, transition: 'color 0.2s', opacity: 0.8, fontSize: '0.9em' }}>➔ {msg.content}</span>
                                        ) : (
                                            renderMessageContent(msg.content)
                                        )}
                                    </p>
                                ))}
                                {isSending && <p className="text-muted" style={{ fontStyle: 'italic' }}>✍️ 작가가 집필 중입니다...</p>}
                                <div ref={chatBottomRef} />
                            </div>
                        ) : (
                            <div className="book-text-container" ref={bookRef} style={{
                                fontFamily: readerSettings.fontFamily, fontSize: `${readerSettings.fontSize}px`, lineHeight: readerSettings.lineHeight,
                                columnCount: 2,
                                columnFill: 'auto', columnGap: '4rem', padding: '3rem 4rem', height: '100%'
                            }}>
                                {storyMessages.length === 0 && (
                                    <div style={{ opacity: 0.8, fontStyle: 'italic' }}>
                                        새로운 이야기가 시작됩니다...
                                    </div>
                                )}
                                {storyMessages.map(msg => (
                                    <p key={msg.id} style={{ marginBottom: '1.5rem' }}>
                                        {msg.role === 'user' ? (
                                            <span style={{ color: userColorStr, transition: 'color 0.2s', opacity: 0.8, fontSize: '0.9em' }}>➔ {msg.content}</span>
                                        ) : (
                                            renderMessageContent(msg.content)
                                        )}
                                    </p>
                                ))}
                                {isSending && <p className="text-muted" style={{ fontStyle: 'italic' }}>✍️ 작가가 집필 중입니다...</p>}
                            </div>
                        )}
                    </div>

                    <button className="book-nav-btn next" onClick={() => scrollPage('next')} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)' }}>
                        <ChevronLeft size={48} style={{ transform: 'rotate(180deg)' }} />
                    </button>
                </div>

                {/* Slider & Prompt Bar */}
                <div className="page-slider-container" style={{ background: '#13151c', borderTop: '1px solid var(--border-color)' }}>
                    <input type="range" className="page-slider" min={0} max={getSliderMax()} value={sliderValue} onChange={e => handleSlider(Number(e.target.value))} />
                </div>

                <div className="prompt-bar-container">
                    <div style={{ flex: 1, position: 'relative' }}>
                        <input type="text" className="prompt-input"
                            placeholder={`이어서 작성할 내용이나 지시를 입력하세요 (예: "마왕이 등장해 분노를 터뜨린다")`}
                            value={msgInput} maxLength={500} onChange={e => setMsgInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            style={{ width: '100%', paddingRight: '4.5rem' }} />
                        <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: msgInput.length >= 450 ? '#f87171' : 'var(--text-muted)' }}>
                            {msgInput.length}/500
                        </span>
                    </div>
                    <button className="prompt-send-btn" onClick={handleSend} disabled={isSending}><Send size={20} /></button>
                </div>
            </div>
        );
    };

    // ── Admin view ───────────────────────────────────────────
    const renderAdmin = () => (
        <div className="main-content fade-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button className="btn btn-outline" onClick={() => navigate('home')}><ChevronLeft size={18} /></button>
                <h1 className="title-font" style={{ fontSize: '1.5rem' }}>
                    <ShieldAlert size={24} className="text-accent" style={{ display: 'inline', marginRight: 8 }} />
                    관리자 패널
                </h1>
            </div>
            <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={20} /> 전체 회원 ({(adminUsers as unknown[]).length}명)
                    </h2>
                    <button className="btn btn-outline" onClick={openAdmin}><RefreshCw size={16} /> 새로고침</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                        <thead>
                            <tr><th>ID</th><th>이름</th><th>이메일</th><th>로그인</th><th>역할</th><th>성인</th><th>프리미엄</th><th>가입일</th></tr>
                        </thead>
                        <tbody>
                            {(adminUsers as { id: number; name: string; email: string; provider: string; role: string; is_adult: number; is_premium: number; created_at: string }[]).map((u) => (
                                <tr key={u.id}>
                                    <td className="text-muted">{u.id}</td>
                                    <td>{u.name}</td>
                                    <td className="text-muted">{u.email}</td>
                                    <td><span className="badge badge-green">{u.provider}</span></td>
                                    <td><span className={`badge ${u.role === 'admin' ? 'badge-red' : 'badge-green'}`}>{u.role}</span></td>
                                    <td>{u.is_adult ? '✅' : '—'}</td>
                                    <td>{u.is_premium ? '✅' : '—'}</td>
                                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{u.created_at?.slice(0, 10)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    return (
        <div className="app-layout">
            {renderNav()}
            {view === 'login' && renderLogin()}
            {view === 'home' && renderHome()}
            {view === 'studio' && renderStudio()}
            {view === 'chat' && renderChat()}
            {view === 'admin' && renderAdmin()}
        </div>
    );
}
