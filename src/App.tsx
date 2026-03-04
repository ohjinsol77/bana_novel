import { useState, useEffect, useRef } from 'react';
import {
    MessageCircle, Plus, Settings, Trash2, LogOut,
    ShieldAlert, CreditCard, ChevronLeft, Send, Sparkles,
    BookOpen, UserCircle2, Globe, Lock, Users, RefreshCw
} from 'lucide-react';
import {
    fetchMe, fetchCharacters, createCharacter, updateCharacter,
    deleteCharacter, fetchChatHistory, sendMessage, clearChat,
    fetchAllUsers, oauthUrl
} from './api';
import './index.css';

// ── Types ───────────────────────────────────────────────────
interface AuthUser {
    id: number; name: string; email: string; role: 'user' | 'admin';
    is_adult: boolean; is_premium: boolean;
}

interface Character {
    id: number; name: string; persona: string; greeting: string;
    background: string; environment: string; avatar_url: string;
    is_public: boolean; created_at: string;
}

interface ChatMsg { id: number; role: 'user' | 'assistant'; content: string; created_at: string; }

// ── App ─────────────────────────────────────────────────────
export default function App() {
    const [user, setUser] = useState<AuthUser | null>({ id: 1, name: 'Guest', email: 'guest@example.com', role: 'user', is_adult: false, is_premium: false });
    const [view, setView] = useState<'login' | 'home' | 'studio' | 'chat' | 'admin'>('home');
    const [characters, setCharacters] = useState<Character[]>([]);
    const [activeChar, setActiveChar] = useState<Character | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
    const [msgInput, setMsgInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [adminUsers, setAdminUsers] = useState<unknown[]>([]);
    const [editMode, setEditMode] = useState<'new' | 'edit'>('new');
    const chatBottomRef = useRef<HTMLDivElement>(null);

    // Reader Settings (Restored)
    const [readerSettings, setReaderSettings] = useState({
        aspectRatio: 'tall' as 'wide' | 'standard' | 'tall',
        fontFamily: 'Gowun Batang',
        fontSize: 18,
        lineHeight: 1.8,
        showBackground: true
    });
    const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
    const [sliderValue, setSliderValue] = useState(0);

    const bookRef = useRef<HTMLDivElement>(null);

    // Character form
    const [form, setForm] = useState({
        name: '', persona: '', greeting: '', background: '', environment: '',
        avatar_url: '', is_public: false
    });

    // ── Bootstrap: read token from URL or localStorage ──────
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get('token');
        if (urlToken) {
            localStorage.setItem('token', urlToken);
            window.history.replaceState({}, '', '/');
        }
        fetchMe().then(me => {
            if (me) {
                setUser(me);
                setView('home');
                loadCharacters();
            } else {
                // Keep guest mode or let user stay on home
                loadCharacters();
            }
        });
    }, []);

    useEffect(() => {
        // Auto-scroll when new messages arrive
        if (!bookRef.current) return;
        const container = bookRef.current;

        if (readerSettings.aspectRatio === 'tall') {
            chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
            // For multi-column horizontal scroll
            setTimeout(() => {
                const maxScrollLeft = container.scrollWidth - container.clientWidth;
                container.scrollTo({ left: maxScrollLeft, behavior: 'smooth' });
                setSliderValue(maxScrollLeft);
            }, 100);
        }
    }, [chatHistory, readerSettings.aspectRatio]);

    // ── Handlers ─────────────────────────────────────────────
    const loadCharacters = async () => {
        try {
            const data = await fetchCharacters();
            setCharacters(data);
        } catch (err: any) {
            console.error('Load characters failed:', err);
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        setView('login');
    };

    const openNewCharacter = () => {
        setForm({ name: '', persona: '', greeting: '', background: '', environment: '', avatar_url: '', is_public: false });
        setEditMode('new');
        setView('studio');
    };

    const openEditCharacter = (char: Character) => {
        setForm({
            name: char.name, persona: char.persona, greeting: char.greeting,
            background: char.background, environment: char.environment,
            avatar_url: char.avatar_url, is_public: char.is_public
        });
        setActiveChar(char);
        setEditMode('edit');
        setView('studio');
    };

    const saveCharacter = async () => {
        if (!form.name.trim()) { alert('캐릭터 이름을 입력하세요'); return; }
        try {
            if (editMode === 'new') {
                const res = await createCharacter(form);
                if (res.error) throw new Error(res.error);
            } else if (activeChar) {
                const res = await updateCharacter(activeChar.id, form);
                if (res.error) throw new Error(res.error);
            }
            await loadCharacters();
            setView('home');
        } catch (err: any) {
            console.error('Save failed:', err);
            alert(`저장 실패: ${err.message}`);
        }
    };

    const removeCharacter = async (id: number) => {
        if (!confirm('정말 삭제할까요?')) return;
        await deleteCharacter(id);
        await loadCharacters();
    };

    const openChat = async (char: Character) => {
        try {
            setActiveChar(char);
            const history = await fetchChatHistory(char.id);
            setChatHistory(history);
            setView('chat');
        } catch (err: any) {
            console.error('Open chat failed:', err);
            alert(`대화 창을 열 수 없습니다: ${err.message}`);
        }
    };

    const handleSend = async () => {
        if (!msgInput.trim() || !activeChar || isSending) return;
        const content = msgInput;
        setMsgInput('');
        setIsSending(true);
        setChatHistory(prev => [...prev, { id: Date.now(), role: 'user', content, created_at: '' }]);
        const reply = await sendMessage(activeChar.id, content);
        setChatHistory(prev => [...prev, { id: reply.id ?? Date.now() + 1, role: 'assistant', content: reply.content, created_at: '' }]);
        setIsSending(false);
    };

    const handleClearChat = async () => {
        if (!activeChar || !confirm('대화 기록을 전부 삭제할까요?')) return;
        await clearChat(activeChar.id);
        setChatHistory([]);
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
        setView('admin');
    };

    // ── Render helpers ───────────────────────────────────────
    const renderNav = () => (
        <nav className="top-nav">
            <div className="nav-brand" onClick={() => view !== 'login' && setView('home')}>
                <BookOpen size={24} className="text-accent" />
                <span>Novel<span className="text-accent">AI</span></span>
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

    // ── Home: character list ─────────────────────────────────
    const renderHome = () => (
        <div className="main-content fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 className="title-font" style={{ fontSize: '1.8rem' }}>내 캐릭터</h1>
                    <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                        AI 캐릭터를 생성하고 대화를 시작하세요
                    </p>
                </div>
                <button className="btn btn-primary" onClick={openNewCharacter}>
                    <Plus size={18} /> 새 캐릭터
                </button>
            </div>

            {characters.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <UserCircle2 size={60} className="text-muted" style={{ margin: '0 auto 1rem' }} />
                    <p className="text-muted">아직 캐릭터가 없습니다.<br />새 캐릭터를 만들어 대화를 시작해보세요!</p>
                </div>
            ) : (
                <div className="char-grid">
                    {characters.map(char => (
                        <div className="char-card glass-panel" key={char.id}>
                            <div className="char-avatar">
                                {char.avatar_url
                                    ? <img src={char.avatar_url} alt={char.name} />
                                    : <UserCircle2 size={48} className="text-muted" />
                                }
                            </div>
                            <div className="char-info">
                                <h3>{char.name}</h3>
                                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                                    {char.persona?.slice(0, 60) || '설명 없음'}...
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                                    {char.is_public ? <Globe size={14} className="text-muted" /> : <Lock size={14} className="text-muted" />}
                                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>{char.is_public ? '공개' : '비공개'}</span>
                                </div>
                            </div>
                            <div className="char-actions">
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => openChat(char)}>
                                    <MessageCircle size={16} /> 대화
                                </button>
                                <button className="btn btn-outline" onClick={() => openEditCharacter(char)}>
                                    <Settings size={16} />
                                </button>
                                <button className="btn btn-outline" style={{ color: '#f87171', borderColor: '#f87171' }} onClick={() => removeCharacter(char.id)}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // ── Studio: character creation/edit ──────────────────────
    const renderStudio = () => (
        <div className="main-content fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button className="btn btn-outline" onClick={() => setView('home')}><ChevronLeft size={18} /></button>
                    <h1 className="title-font" style={{ fontSize: '1.5rem' }}>
                        {editMode === 'new' ? '새 캐릭터 만들기' : `${form.name || '캐릭터'} 수정`}
                    </h1>
                </div>
                <button className="btn btn-primary" onClick={saveCharacter}>
                    <Sparkles size={16} /> 저장
                </button>
            </div>

            <div className="studio-layout">
                {/* 기본 설정 */}
                <div className="glass-panel">
                    <h2 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <UserCircle2 size={20} className="text-accent" /> 캐릭터 기본 설정
                    </h2>

                    <div className="input-group">
                        <label>이름 *</label>
                        <input className="input-control" placeholder="예: 이세계 용사 루미아" value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })} />
                    </div>

                    <div className="input-group">
                        <label>아바타 이미지 URL (선택)</label>
                        <input className="input-control" placeholder="https://example.com/image.jpg" value={form.avatar_url}
                            onChange={e => setForm({ ...form, avatar_url: e.target.value })} />
                        {form.avatar_url && (
                            <img src={form.avatar_url} alt="preview" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', marginTop: '0.5rem', border: '2px solid var(--accent)' }} />
                        )}
                    </div>

                    <div className="input-group">
                        <label>첫 인사말 (대화 시작 시 표시)</label>
                        <input className="input-control" placeholder="예: 안녕! 나는 루미아야. 같이 이야기해줘서 고마워!"
                            value={form.greeting} onChange={e => setForm({ ...form, greeting: e.target.value })} />
                    </div>

                    <div className="input-group" style={{ marginBottom: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.is_public}
                                onChange={e => setForm({ ...form, is_public: e.target.checked })} />
                            공개 캐릭터 (다른 유저에게 공개)
                        </label>
                    </div>
                </div>

                {/* 상세 설정 */}
                <div className="glass-panel">
                    <h2 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Settings size={20} className="text-accent" /> 상세 설정 (AI 프롬프트)
                    </h2>

                    <div className="input-group">
                        <label>캐릭터 성격, 말투, 특징 (핵심)</label>
                        <textarea className="input-control" style={{ minHeight: 130 }}
                            placeholder={`예:\n- 쾌활하고 직설적인 성격의 16세 소녀\n- 반말 사용, 가끔 고어체 섞어 씀\n- 마법을 매우 좋아하며 수다스럽다\n- 항상 상대방을 응원해준다`}
                            value={form.persona} onChange={e => setForm({ ...form, persona: e.target.value })} />
                    </div>

                    <div className="input-group">
                        <label>배경 / 세계관 설정</label>
                        <textarea className="input-control" style={{ minHeight: 100 }}
                            placeholder="예: 마법과 과학이 공존하는 이세계. 800년 전 마왕이 부활해 전쟁 중. 주인공은 마왕을 물리치러 온 이세계 용사다."
                            value={form.background} onChange={e => setForm({ ...form, background: e.target.value })} />
                    </div>

                    <div className="input-group" style={{ marginBottom: 0 }}>
                        <label>현재 주변 환경 / 상황</label>
                        <textarea className="input-control" style={{ minHeight: 80 }}
                            placeholder="예: 왕도의 모험가 길드 카운터. 낮이며 사람들이 많다. 루미아는 의뢰 게시판 앞에 서 있다."
                            value={form.environment} onChange={e => setForm({ ...form, environment: e.target.value })} />
                    </div>
                </div>
            </div>
        </div>
    );

    // ── Chat view ────────────────────────────────────────────
    // ── Chat view (Restored to Full Reader UI) ──────────────
    const renderChat = () => (
        <div className="chat-layout fade-in" style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div className="chat-header glass-panel" style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-4">
                    <button className="btn-icon" onClick={() => setView('home')}><ChevronLeft size={22} /></button>
                    <div className="font-bold flex items-center gap-2">
                        {activeChar?.avatar_url && <img src={activeChar.avatar_url} style={{ width: 24, height: 24, borderRadius: '50%' }} />}
                        {activeChar?.name}
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
                            position: 'absolute', top: '50px', right: 0, width: '280px', zIndex: 100,
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)', padding: '1.5rem'
                        }}>
                            <h3 style={{ fontSize: '1rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Settings size={18} /> 뷰어 설정
                            </h3>

                            <div className="input-group">
                                <label>화면 비율</label>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    {(['wide', 'standard', 'tall'] as const).map(r => (
                                        <button key={r} className={`btn btn-outline ${readerSettings.aspectRatio === r ? 'active' : ''}`}
                                            style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', borderColor: readerSettings.aspectRatio === r ? 'var(--accent)' : '' }}
                                            onClick={() => setReaderSettings({ ...readerSettings, aspectRatio: r })}>
                                            {r === 'wide' ? '와이드' : r === 'standard' ? '표준' : '세로집중'}
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
                            {chatHistory.length === 0 && activeChar?.greeting && (
                                <p style={{ opacity: 0.8 }}><b>{activeChar.name}:</b> {activeChar.greeting}</p>
                            )}
                            {chatHistory.map(msg => (
                                <p key={msg.id} style={{ marginBottom: '1.5rem', textAlign: 'justify' }}>
                                    <b style={{ color: msg.role === 'user' ? 'var(--accent)' : 'inherit' }}>
                                        {msg.role === 'user' ? '나' : activeChar?.name}:
                                    </b> {msg.content}
                                </p>
                            ))}
                            {isSending && <p className="text-muted">입력 중...</p>}
                            <div ref={chatBottomRef} />
                        </div>
                    ) : (
                        <div className="book-text-container" ref={bookRef} style={{
                            fontFamily: readerSettings.fontFamily, fontSize: `${readerSettings.fontSize}px`, lineHeight: readerSettings.lineHeight,
                            columnCount: 2, columnGap: '4rem', padding: '3rem 4rem', height: '100%'
                        }}>
                            {chatHistory.length === 0 && activeChar?.greeting && (
                                <p><b>{activeChar.name}:</b> {activeChar.greeting}</p>
                            )}
                            {chatHistory.map(msg => (
                                <p key={msg.id} style={{ marginBottom: '1.5rem' }}>
                                    <b>{msg.role === 'user' ? '나' : activeChar?.name}:</b> {msg.content}
                                </p>
                            ))}
                            {isSending && <p className="text-muted">입력 중...</p>}
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
                        placeholder={`${activeChar?.name}에게 말을 건네세요...`}
                        value={msgInput} maxLength={500} onChange={e => setMsgInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        style={{ width: '100%', paddingRight: '4.5rem' }} />
                    <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: msgInput.length >= 450 ? '#f87171' : 'var(--text-muted)' }}>
                        {msgInput.length}/500
                    </span>
                </div>
                <button className="prompt-send-btn" onClick={handleSend} disabled={isSending}><Send size={20} /></button>
            </div>
        </div >
    );

    // ── Admin view ───────────────────────────────────────────
    const renderAdmin = () => (
        <div className="main-content fade-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button className="btn btn-outline" onClick={() => setView('home')}><ChevronLeft size={18} /></button>
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
