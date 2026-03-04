import React, { useState, useEffect } from 'react';
import {
    Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, List, MonitorPlay,
    Music, Heart, Settings, Maximize2, Sparkles, User, Crown, LogOut, Disc,
    CheckCircle2, Lock, Smartphone, ShieldAlert, Users, CreditCard, PlaySquare,
    Edit, Trash2, Eye, EyeOff, Plus, Search, Filter
} from 'lucide-react';
import './index.css';

type UserTier = 'guest' | 'general' | 'premium' | 'vip' | 'admin';

interface UserState {
    isLoggedIn: boolean;
    tier: UserTier;
    name: string;
    email: string;
}

type TrackType = 'audio' | 'video';
type TrackCategory = 'calm' | 'active' | 'sleep' | 'focus' | 'female' | 'male' | 'nature' | 'temple' | 'guide';

interface Track {
    id: number;
    type: TrackType;
    category: TrackCategory;
    title: string;
    artist: string;
    duration: string;
    cover: string;
    isPremium?: boolean;
    isVip?: boolean;
}

const AUDIO_CATEGORIES = [
    { id: 'calm', label: '잔잔한', icon: '🌊', bg: 'linear-gradient(135deg, #4f46e5, #3b82f6)' },
    { id: 'active', label: '활발한', icon: '🔥', bg: 'linear-gradient(135deg, #ea580c, #f59e0b)' },
    { id: 'sleep', label: '수면', icon: '🌙', bg: 'linear-gradient(135deg, #312e81, #4338ca)' },
    { id: 'focus', label: '집중', icon: '💡', bg: 'linear-gradient(135deg, #0f766e, #14b8a6)' },
    { id: 'female', label: '여성스님', icon: '🌸', bg: 'linear-gradient(135deg, #be185d, #f43f5e)' },
    { id: 'male', label: '남성스님', icon: '📿', bg: 'linear-gradient(135deg, #854d0e, #ca8a04)' },
] as const;

const VIDEO_CATEGORIES = [
    { id: 'nature', label: '자연/풍경', icon: '🍃', bg: 'linear-gradient(135deg, #166534, #22c55e)' },
    { id: 'temple', label: '사찰의 하루', icon: '🏯', bg: 'linear-gradient(135deg, #9f1239, #e11d48)' },
    { id: 'guide', label: '명상 가이드', icon: '🧘', bg: 'linear-gradient(135deg, #6b21a8, #a855f7)' },
] as const;

const MOCK_PLAYLIST: Track[] = [
    { id: 1, type: 'audio', category: 'calm', title: '잔잔한 반야심경 독경', artist: '대한불교조계종', duration: '5:30', cover: 'https://images.unsplash.com/photo-1590422749909-51928df776fa?auto=format&fit=crop&q=80&w=600' },
    { id: 2, type: 'audio', category: 'sleep', title: '마음을 비우는 물소리와 목탁', artist: '자연의 소리', duration: '12:00', cover: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&q=80&w=600' },
    { id: 3, type: 'video', category: 'temple', title: '고즈넉한 산사의 아침 풍경', artist: '힐링 비주얼', duration: '15:20', cover: 'https://images.unsplash.com/photo-1604871000636-074fa5117945?auto=format&fit=crop&q=80&w=600' },
    { id: 4, type: 'audio', category: 'focus', title: '금강경 독송 (명상용)', artist: '마음수련원', duration: '45:00', cover: 'https://images.unsplash.com/photo-1517482813133-72210878e12d?auto=format&fit=crop&q=80&w=600', isPremium: true },
    { id: 5, type: 'video', category: 'nature', title: '연꽃 피는 연못 백색소음', artist: 'Nature Healing', duration: '8:45', cover: 'https://images.unsplash.com/photo-1516084457583-b78f8b89e3a6?auto=format&fit=crop&q=80&w=600' },
    { id: 6, type: 'audio', category: 'female', title: '싱잉볼과 깊은 잠 (여성 보이스)', artist: '사운드 테라피', duration: '20:00', cover: 'https://images.unsplash.com/photo-1602192102830-1011508db8c5?auto=format&fit=crop&q=80&w=600' },
    { id: 7, type: 'audio', category: 'male', title: '새벽 예불 (남성스님)', artist: '해인사 스님', duration: '30:00', cover: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=600' },
    { id: 8, type: 'video', category: 'guide', title: 'VIP 전용: 심도 깊은 참선 가이드', artist: '대선사', duration: '60:00', cover: 'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&q=80&w=600', isVip: true, isHidden: false, createdAt: '2026-02-15' },
].map(item => ({ ...item, isHidden: item.isHidden || false, createdAt: item.createdAt || '2026-01-01' }));

const MOCK_USERS = [
    { id: 1, name: '구글 사용자', email: 'user@Google.com', tier: 'general', joinDate: '2026-01-15', lastLogin: '2026-02-26 10:30', status: '활성' },
    { id: 2, name: '카카오 사용자', email: 'vip@Kakao.com', tier: 'vip', joinDate: '2026-02-01', lastLogin: '2026-02-26 14:15', status: '활성' },
    { id: 3, name: '네이버 사용자', email: 'premium@Naver.com', tier: 'premium', joinDate: '2026-02-10', lastLogin: '2026-02-25 09:00', status: '활성' },
    { id: 4, name: '애플 사용자', email: 'test@Apple.com', tier: 'guest', joinDate: '2026-02-20', lastLogin: '2026-02-20 18:00', status: '차단' },
];

const MOCK_PAYMENTS = [
    { id: 'PAY-1029', user: '카카오 사용자', plan: 'VIP 1개월', method: '카카오페이', amount: '9,900', date: '2026-02-25 10:15:30', status: '완료' },
    { id: 'PAY-1030', user: '네이버 사용자', plan: 'Premium 1개월', method: '신용카드', amount: '4,900', date: '2026-02-26 09:12:05', status: '완료' },
    { id: 'PAY-1031', user: '애플 사용자', plan: 'VIP 1년', method: '네이버페이', amount: '99,000', date: '2026-02-26 13:45:00', status: '환불' },
];

export default function App() {
    const [user, setUser] = useState<UserState>({ isLoggedIn: false, tier: 'guest', name: '', email: '' });
    const [activeMenu, setActiveMenu] = useState('home');
    const [adminView, setAdminView] = useState('users');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const [mockUsers, setMockUsers] = useState(MOCK_USERS);
    const [mockPayments, setMockPayments] = useState(MOCK_PAYMENTS);
    const [mockPlaylist, setMockPlaylist] = useState(MOCK_PLAYLIST as any[]);

    const [contentFilter, setContentFilter] = useState('all');
    const [userSearchTerm, setUserSearchTerm] = useState('');

    // Player State
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            if (event.state) {
                if (event.state.menu !== undefined) setActiveMenu(event.state.menu);
                if (event.state.category !== undefined) setSelectedCategory(event.state.category);
            } else {
                setActiveMenu('home');
                setSelectedCategory(null);
            }
        };

        window.addEventListener('popstate', handlePopState);

        // 초기 로드 시 브라우저 히스토리 스택에 초기 상태 등록
        if (!window.history.state) {
            window.history.replaceState({ menu: 'home', category: null }, '');
        }

        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const changeMenu = (menu: string) => {
        setActiveMenu(menu);
        setSelectedCategory(null);
        window.history.pushState({ menu, category: null }, '');
    };

    const changeCategory = (category: string | null) => {
        setSelectedCategory(category);
        window.history.pushState({ menu: activeMenu, category }, '');
    };
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [volume, setVolume] = useState(80);
    const [isMuted, setIsMuted] = useState(false);
    const [bgPlayEnabled, setBgPlayEnabled] = useState(false);

    // Favorites (My Library)
    const [favorites, setFavorites] = useState<number[]>([]);

    // Simulation of progress bar
    useEffect(() => {
        let interval: any;
        if (isPlaying && currentTrack) {
            interval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 100) {
                        setIsPlaying(false); return 0;
                    }
                    return prev + 0.5;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, currentTrack]);

    const togglePlay = () => setIsPlaying(!isPlaying);

    const toggleFavorite = (trackId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setFavorites(prev => prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]);
    };

    const handleTrackSelect = (track: Track) => {
        if (track.isVip && !['vip', 'admin'].includes(user.tier)) {
            alert('VIP 회원 전용 콘텐츠입니다.');
            return;
        }
        if (track.isPremium && !['premium', 'vip', 'admin'].includes(user.tier)) {
            alert('프리미엄 회원 전용 콘텐츠입니다.');
            return;
        }
        setCurrentTrack(track);
        setIsPlaying(true);
        setProgress(0);
    };

    const handleLogin = (provider: string) => {
        if (provider === 'Admin') {
            setUser({ isLoggedIn: true, tier: 'admin', name: `관리자`, email: `admin@jungto.com` });
        } else {
            setUser({ isLoggedIn: true, tier: 'general', name: `${provider} 사용자`, email: `user@${provider}.com` });
        }
        changeMenu('home');
    };

    const handleLogout = () => {
        setUser({ isLoggedIn: false, tier: 'guest', name: '', email: '' });
        changeMenu('home');
        setIsPlaying(false);
        setCurrentTrack(null);
    };

    const formatCurrentTime = (percent: number, maxTimeStr: string) => {
        const [min, sec] = maxTimeStr.split(':').map(Number);
        const totalSecs = min * 60 + sec;
        const currentSecs = Math.floor((totalSecs * percent) / 100);
        const cMin = Math.floor(currentSecs / 60);
        const cSec = currentSecs % 60;
        return `${cMin}:${cSec.toString().padStart(2, '0')}`;
    };

    const MENU_ITEMS = [
        { id: 'home', label: '홈', icon: <Sparkles size={20} /> },
        { id: 'audio', label: '독경/음악', icon: <Music size={20} /> },
        { id: 'video', label: '명상/비디오', icon: <MonitorPlay size={20} /> },
        { id: 'library', label: '내 서재', icon: <List size={20} /> },
        { id: 'lounge', label: 'VIP 라운지', icon: <Crown size={20} />, requiresVip: true },
        { id: 'admin', label: '관리자 메뉴', icon: <ShieldAlert size={20} />, requiresAdmin: true },
        { id: 'profile', label: user.isLoggedIn ? '내 정보' : '로그인/가입', icon: <User size={20} /> },
    ];

    const renderContent = () => {
        if (activeMenu === 'home') {
            return (
                <div className="home-view fade-in">
                    <div className="hero-banner">
                        <h2>평온의 순간을 찾아서</h2>
                        <p>다양한 독경과 명상 가이드로 마음의 안식을 찾으세요.</p>
                    </div>
                    <div className="home-sections">
                        <div className="home-card" onClick={() => changeMenu('audio')}>
                            <Music size={40} className="mb-4 text-gold" />
                            <h3>음악 및 독경</h3>
                            <p>상황과 감정에 맞는 다양한 사운드를 제공합니다.</p>
                        </div>
                        <div className="home-card" onClick={() => changeMenu('video')}>
                            <MonitorPlay size={40} className="mb-4 text-gold" />
                            <h3>명상 비디오</h3>
                            <p>마음이 편안해지는 영상과 함께 명상을 즐겨보세요.</p>
                        </div>
                    </div>
                </div>
            );
        }

        if (activeMenu === 'profile') {
            if (!user.isLoggedIn) {
                return (
                    <div className="auth-view fade-in">
                        <div className="auth-card glass-panel">
                            <div className="lotus-icon mb-4" style={{ fontSize: '3rem', textAlign: 'center' }}>🪷</div>
                            <h2 className="text-center mb-6" style={{ fontSize: '1.8rem' }}>정토에 오신 것을 환영합니다</h2>
                            <p className="text-center text-muted mb-8">소셜 계정으로 3초 만에 시작하세요.</p>

                            <div className="social-login-grid">
                                <button className="btn-social google" onClick={() => handleLogin('Google')}>
                                    <span className="icon">G</span> 구글로 계속하기
                                </button>
                                <button className="btn-social naver" onClick={() => handleLogin('Naver')}>
                                    <span className="icon">N</span> 네이버로 계속하기
                                </button>
                                <button className="btn-social kakao" onClick={() => handleLogin('Kakao')}>
                                    <span className="icon">K</span> 카카오로 계속하기
                                </button>
                                <button className="btn-social" style={{ background: '#333' }} onClick={() => handleLogin('Admin')}>
                                    <ShieldAlert size={18} /> 관리자 계정 (데모 접속)
                                </button>
                            </div>
                        </div>
                    </div>
                );
            } else {
                return (
                    <div className="profile-view fade-in">
                        <div className="glass-panel profile-card">
                            <div className="profile-header">
                                <div className="avatar">{user.name.charAt(0)}</div>
                                <div className="profile-info">
                                    <h2>{user.name}</h2>
                                    <p>{user.email}</p>
                                    <div className={`tier-badge ${user.tier}`}>{user.tier.toUpperCase()} 회원</div>
                                </div>
                                <button className="btn-logout" onClick={handleLogout}><LogOut size={16} /> 로그아웃</button>
                            </div>

                            <div className="membership-upgrade">
                                <h3>멤버십 업그레이드</h3>
                                <div className="upgrade-cards">
                                    <div className={`upgrade-card ${user.tier === 'premium' ? 'current' : ''}`}>
                                        <h4>Premium</h4>
                                        <ul>
                                            <li><CheckCircle2 size={16} /> 프리미엄 음원 무제한</li>
                                            <li><CheckCircle2 size={16} /> 백그라운드 재생 지원</li>
                                        </ul>
                                        <button
                                            className="btn-primary"
                                            onClick={() => setUser({ ...user, tier: 'premium' })}
                                            disabled={user.tier === 'premium' || user.tier === 'vip'}
                                        >
                                            {user.tier === 'premium' || user.tier === 'vip' ? '이용 중' : '프리미엄 구독 (월 4,900원)'}
                                        </button>
                                    </div>
                                    <div className={`upgrade-card vip-card ${user.tier === 'vip' ? 'current' : ''}`}>
                                        <h4>VIP <Crown size={16} /></h4>
                                        <ul>
                                            <li><CheckCircle2 size={16} /> 프리미엄 모든 혜택</li>
                                            <li><CheckCircle2 size={16} /> VIP 전용 라운지/영상</li>
                                        </ul>
                                        <button
                                            className="btn-gold"
                                            onClick={() => setUser({ ...user, tier: 'vip' })}
                                            disabled={user.tier === 'vip'}
                                        >
                                            {user.tier === 'vip' ? '이용 중' : 'VIP 구독 (월 9,900원)'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
        }

        if (activeMenu === 'admin') {
            if (user.tier !== 'admin') {
                return <div className="fade-in text-center p-8">권한이 없습니다.</div>;
            }
            return (
                <div className="admin-dashboard fade-in">
                    <div className="lounge-header mb-6">
                        <ShieldAlert size={32} className="text-gold" />
                        <h2>관리자 대시보드</h2>
                    </div>
                    <div className="admin-layout-top">
                        {/* Admin Sub Menu */}
                        <div className="admin-top-menu glass-panel">
                            <button
                                className={`admin-tab-btn ${adminView === 'users' ? 'active' : ''}`}
                                onClick={() => setAdminView('users')}
                            >
                                <Users size={18} /> 회원 관리
                            </button>
                            <button
                                className={`admin-tab-btn ${adminView === 'payments' ? 'active' : ''}`}
                                onClick={() => setAdminView('payments')}
                            >
                                <CreditCard size={18} /> 최근 결제 내역
                            </button>
                            <button
                                className={`admin-tab-btn ${adminView === 'content' ? 'active' : ''}`}
                                onClick={() => setAdminView('content')}
                            >
                                <PlaySquare size={18} /> 앱 콘텐츠 관리
                            </button>
                        </div>

                        {/* Admin Content Pane */}
                        <div className="admin-content-pane glass-panel p-6">
                            {adminView === 'users' && (
                                <div className="fade-in">
                                    <div className="admin-header-actions mb-4">
                                        <h3 className="text-gold flex items-center gap-2 m-0"><Users size={20} /> 회원 관리</h3>
                                        <div className="admin-controls">
                                            <div className="search-box">
                                                <Search size={16} />
                                                <input type="text" placeholder="이름/이메일 검색..." value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="admin-table-container">
                                        <table className="admin-table">
                                            <thead><tr><th>이름</th><th>이메일</th><th>등급</th><th>상태</th><th>가입일</th><th>마지막 로그인</th><th>관리</th></tr></thead>
                                            <tbody>
                                                {mockUsers.filter(u => u.name.includes(userSearchTerm) || u.email.includes(userSearchTerm)).map(u => (
                                                    <tr key={u.id}>
                                                        <td>{u.name}</td>
                                                        <td>{u.email}</td>
                                                        <td><span className={`tier-badge ${u.tier}`}>{u.tier}</span></td>
                                                        <td><span className={`status-badge ${u.status === '차단' ? 'canceled' : ''}`}>{u.status}</span></td>
                                                        <td>{u.joinDate}</td>
                                                        <td className="text-muted">{u.lastLogin}</td>
                                                        <td>
                                                            <div className="action-buttons">
                                                                <button className="btn-action edit tooltip" data-tip="수정/등급변경"><Edit size={16} /></button>
                                                                <button className="btn-action danger tooltip" data-tip={u.status === '차단' ? '차단해제' : '차단/삭제'}><Trash2 size={16} /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {adminView === 'payments' && (
                                <div className="fade-in">
                                    <div className="admin-header-actions mb-4">
                                        <h3 className="text-gold flex items-center gap-2 m-0"><CreditCard size={20} /> 최근 결제 내역</h3>
                                        <div className="admin-controls">
                                            <button className="btn-outline"><Filter size={16} /> 기간별 조회</button>
                                        </div>
                                    </div>
                                    <div className="admin-table-container">
                                        <table className="admin-table">
                                            <thead><tr><th>결제번호</th><th>사용자</th><th>구독 상품</th><th>결제수단</th><th>결제금액</th><th>결제일시</th><th>상태</th><th>동작</th></tr></thead>
                                            <tbody>
                                                {mockPayments.map(p => (
                                                    <tr key={p.id}>
                                                        <td className="text-muted text-sm">{p.id}</td>
                                                        <td>{p.user}</td>
                                                        <td>{p.plan}</td>
                                                        <td>{p.method}</td>
                                                        <td className="font-bold">₩{p.amount}</td>
                                                        <td className="text-muted text-sm">{p.date}</td>
                                                        <td><span className={`status-badge ${p.status === '환불' ? 'canceled' : ''}`}>{p.status}</span></td>
                                                        <td>
                                                            {p.status === '완료' && <button className="btn-action danger text-sm">환불</button>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {adminView === 'content' && (
                                <div className="fade-in">
                                    <div className="admin-header-actions mb-4">
                                        <h3 className="text-gold flex items-center gap-2 m-0"><PlaySquare size={20} /> 앱 콘텐츠 관리</h3>
                                        <div className="admin-controls">
                                            <select className="filter-select" value={contentFilter} onChange={(e) => setContentFilter(e.target.value)}>
                                                <option value="all">모든 콘텐츠</option>
                                                <option value="audio">음원(독경/음악)</option>
                                                <option value="video">명상 비디오</option>
                                                <option value="hidden">숨김 처리됨</option>
                                            </select>
                                            <button className="btn-outline"><Plus size={16} /> 카테고리 추가</button>
                                            <button className="btn-primary-sm"><Plus size={16} /> 새 콘텐츠</button>
                                        </div>
                                    </div>
                                    <div className="admin-table-container">
                                        <table className="admin-table">
                                            <thead><tr><th>유형</th><th>카테고리</th><th>제목</th><th>재생시간</th><th>조회수(Mock)</th><th>상태</th><th>등급 제한</th><th>업로드일</th><th>관리</th></tr></thead>
                                            <tbody>
                                                {mockPlaylist
                                                    .filter(t => contentFilter === 'all' || (contentFilter === 'hidden' ? t.isHidden : t.type === contentFilter))
                                                    .map(track => (
                                                        <tr key={track.id} style={{ opacity: track.isHidden ? 0.6 : 1 }}>
                                                            <td>{track.type === 'video' ? <MonitorPlay size={16} className="text-muted" /> : <Music size={16} className="text-muted" />}</td>
                                                            <td>{track.category}</td>
                                                            <td>{track.title}</td>
                                                            <td>{track.duration}</td>
                                                            <td>{Math.floor(Math.random() * 5000) + 100}</td>
                                                            <td>
                                                                {track.isHidden ? <span className="status-badge canceled">숨김</span> : <span className="status-badge">공개</span>}
                                                            </td>
                                                            <td>
                                                                {track.isVip ? <span className="tier-badge vip">VIP</span> : track.isPremium ? <span className="tier-badge premium">PREMIUM</span> : 'Free'}
                                                            </td>
                                                            <td className="text-muted text-sm">{track.createdAt}</td>
                                                            <td>
                                                                <div className="action-buttons">
                                                                    <button
                                                                        className="btn-action edit tooltip"
                                                                        data-tip={track.isHidden ? '공개하기' : '숨기기'}
                                                                        onClick={() => setMockPlaylist(prev => prev.map(t => t.id === track.id ? { ...t, isHidden: !t.isHidden } : t))}
                                                                    >
                                                                        {track.isHidden ? <Eye size={16} /> : <EyeOff size={16} />}
                                                                    </button>
                                                                    <button className="btn-action edit tooltip" data-tip="수정"><Edit size={16} /></button>
                                                                    <button
                                                                        className="btn-action danger tooltip"
                                                                        data-tip="삭제"
                                                                        onClick={() => { if (confirm('정말 삭제하시겠습니까?')) setMockPlaylist(prev => prev.filter(t => t.id !== track.id)) }}
                                                                    ><Trash2 size={16} /></button>
                                                                </div>
                                                            </td>
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
            );
        }

        if (activeMenu === 'lounge') {
            if (user.tier !== 'vip') {
                return (
                    <div className="lounge-locked fade-in">
                        <Lock size={64} className="mb-4 text-gold" />
                        <h2>VIP 전용 라운지입니다</h2>
                        <p>다과와 명상에 관한 깊은 이야기를 나누거나<br />심도 깊은 수련 영상을 시청할 수 있는 프라이빗 공간입니다.</p>
                        <button className="btn-gold mt-6" onClick={() => changeMenu('profile')}>VIP 알아보기</button>
                    </div>
                );
            }
            return (
                <div className="lounge-view fade-in">
                    <div className="lounge-header">
                        <Crown size={32} />
                        <h2>프리미엄 무문관 (VIP 라운지)</h2>
                    </div>
                    <div className="playlist-content mt-4 glass-panel" style={{ height: '400px' }}>
                        {MOCK_PLAYLIST.filter(track => track.isVip).map(track => renderPlaylistItem(track))}
                    </div>
                </div>
            );
        }

        if (activeMenu === 'library') {
            const favTracks = MOCK_PLAYLIST.filter(t => favorites.includes(t.id));
            return (
                <div className="library-view fade-in">
                    <h2>내 서재 (즐겨찾기)</h2>
                    <p className="text-muted mb-6">마음에 와닿았던 법음과 영상을 모아두었습니다.</p>
                    <div className="playlist-content glass-panel" style={{ height: '500px' }}>
                        {favTracks.length === 0 ? (
                            <div className="empty-state">아직 즐겨찾는 항목이 없습니다.</div>
                        ) : (
                            favTracks.map(track => renderPlaylistItem(track))
                        )}
                    </div>
                </div>
            );
        }

        // Audio or Video Flow
        const isAudio = activeMenu === 'audio';
        const categories = isAudio ? AUDIO_CATEGORIES : VIDEO_CATEGORIES;
        const filteredTracks = selectedCategory
            ? mockPlaylist.filter(t => t.type === (isAudio ? 'audio' : 'video') && t.category === selectedCategory && !t.isHidden)
            : mockPlaylist.filter(t => t.type === (isAudio ? 'audio' : 'video') && !t.isHidden);

        return (
            <div className="media-category-view fade-in">
                {!selectedCategory ? (
                    // 2nd Level Classification Grid
                    <div className="category-selection fade-in">
                        <h2>{isAudio ? '어떤 소리가 필요하신가요?' : '어떤 풍경이 필요하신가요?'}</h2>
                        <div className="category-grid mt-6">
                            {categories.map(cat => (
                                <button
                                    key={cat.id}
                                    className="category-tile"
                                    style={{ background: cat.bg }}
                                    onClick={() => { changeCategory(cat.id); setCurrentTrack(null); }}
                                >
                                    <span className="cat-icon">{cat.icon}</span>
                                    <span className="cat-label">{cat.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="player-flow fade-in">
                        <div className="bread-crumbs mb-4">
                            <button onClick={() => window.history.back()} className="back-btn">← 뒤로가기</button>
                            <span> {'>'} {categories.find(c => c.id === selectedCategory)?.label}</span>
                        </div>
                        <div className="content-grid">
                            {/* Player */}
                            <section className="player-section shrink">
                                {currentTrack ? (
                                    <>
                                        <div className={`media-display ${currentTrack.type === 'video' ? 'video-mode' : 'audio-mode'}`}>
                                            <img src={currentTrack.cover} alt={currentTrack.title} className={`media-cover-bg ${isPlaying && currentTrack.type === 'audio' ? 'spin' : ''}`} />
                                            <div className="media-overlay"></div>
                                            {currentTrack.type === 'video' && (
                                                <div className="video-indicator">
                                                    <MonitorPlay size={48} color="rgba(255,255,255,0.7)" />
                                                    <span>재생 중</span>
                                                </div>
                                            )}
                                            <div className="media-info-large">
                                                <div className="media-badge">
                                                    {currentTrack.type === 'video' ? <MonitorPlay size={14} /> : <Music size={14} />}
                                                    {currentTrack.isPremium ? <Crown size={14} /> : null}
                                                    {isAudio ? ' 명상 오디오' : ' 명상 비디오'}
                                                </div>
                                                <h2>{currentTrack.title}</h2>
                                                <p>{currentTrack.artist}</p>
                                            </div>
                                        </div>

                                        <div className="player-controls-container glass-panel">
                                            {(user.tier === 'premium' || user.tier === 'vip') && (
                                                <div className="bg-play-toggle">
                                                    <label className="switch">
                                                        <input type="checkbox" checked={bgPlayEnabled} onChange={(e) => setBgPlayEnabled(e.target.checked)} />
                                                        <span className="slider round"></span>
                                                    </label>
                                                    <span className="text-sm"><Smartphone size={14} /> 백그라운드 재생</span>
                                                </div>
                                            )}

                                            <div className="progress-bar-container">
                                                <input type="range" min="0" max="100" value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="progress-slider" />
                                                <div className="time-info">
                                                    <span>{formatCurrentTime(progress, currentTrack.duration)}</span>
                                                    <span>{currentTrack.duration}</span>
                                                </div>
                                            </div>

                                            <div className="controls-row">
                                                <div className="volume-control hidden-mobile">
                                                    <button className="icon-btn" onClick={() => setIsMuted(!isMuted)}>
                                                        {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                                                    </button>
                                                    <input type="range" min="0" max="100" value={isMuted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setIsMuted(false); }} className="volume-slider" />
                                                </div>

                                                <div className="main-controls">
                                                    <button className="icon-btn hover-gold"><SkipBack size={24} /></button>
                                                    <button className="play-pause-btn" onClick={togglePlay}>
                                                        {isPlaying ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: '4px' }} />}
                                                    </button>
                                                    <button className="icon-btn hover-gold"><SkipForward size={24} /></button>
                                                </div>

                                                <div className="extra-controls">
                                                    <button className={`icon-btn hover-gold ${favorites.includes(currentTrack.id) ? 'fav-active' : ''}`} onClick={(e) => toggleFavorite(currentTrack.id, e)}>
                                                        <Heart size={20} fill={favorites.includes(currentTrack.id) ? "currentColor" : "none"} />
                                                    </button>
                                                    <button className="icon-btn hover-gold hidden-mobile"><Maximize2 size={20} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="empty-player glass-panel">
                                        <Disc size={64} className="text-muted mb-4" />
                                        <p>우측 리스트에서 선택해주세요.</p>
                                    </div>
                                )}
                            </section>

                            {/* Playlist */}
                            <section className="playlist-section glass-panel">
                                <div className="playlist-tabs">
                                    <button className="tab-btn active"><List size={18} /> 추천 목록</button>
                                </div>
                                <div className="playlist-content">
                                    {filteredTracks.map(track => renderPlaylistItem(track))}
                                </div>
                            </section>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderPlaylistItem = (track: Track) => {
        const isPlayingThis = currentTrack?.id === track.id;
        return (
            <div
                key={track.id}
                className={`playlist-item ${isPlayingThis ? 'playing' : ''}`}
                onClick={() => handleTrackSelect(track)}
            >
                <div className="item-cover">
                    <img src={track.cover} alt={track.title} />
                    {isPlayingThis && isPlaying && (
                        <div className="playing-eq">
                            <div className="bar"></div>
                            <div className="bar"></div>
                            <div className="bar"></div>
                        </div>
                    )}
                </div>
                <div className="item-details">
                    <h4>{track.title}</h4>
                    <p>{track.artist} {track.isPremium && <span className="premium-tag">Premium</span>}</p>
                </div>
                <div className="item-actions">
                    <button className={`icon-btn sm ${favorites.includes(track.id) ? 'fav-active' : ''}`} onClick={(e) => toggleFavorite(track.id, e)}>
                        <Heart size={16} fill={favorites.includes(track.id) ? "currentColor" : "none"} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="temple-app">
            <nav className="main-nav">
                <div className="nav-logo">
                    <div className="lotus-icon">🪷</div>
                    <h1 className="nav-title">정토</h1>
                </div>
                <ul className="nav-menu">
                    {MENU_ITEMS.map((item) => {
                        if (item.requiresVip && user.tier !== 'vip') return null;
                        if (item.requiresAdmin && user.tier !== 'admin') return null;
                        return (
                            <li key={item.id} className="nav-item">
                                <button
                                    className={`nav-btn ${activeMenu === item.id ? 'active' : ''}`}
                                    onClick={() => { changeMenu(item.id); setIsMobileMenuOpen(false); }}
                                >
                                    {item.icon}
                                    <span className="nav-label">{item.label}</span>
                                </button>
                            </li>
                        )
                    })}
                </ul>
                <div className="nav-bottom hidden-mobile">
                    <button className="icon-btn hover-gold"><Settings size={20} /></button>
                </div>
            </nav>

            <main className="temple-main-content">
                <header className="mobile-header">
                    <div className="logo-area">
                        <div className="lotus-icon">🪷</div>
                        <h1>정토</h1>
                    </div>
                    <button className="icon-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                        <List size={24} />
                    </button>
                </header>

                {renderContent()}

            </main>

            {isMobileMenuOpen && (
                <div className="mobile-menu-overlay" onClick={() => setIsMobileMenuOpen(false)}>
                    <div className="mobile-menu-panel" onClick={e => e.stopPropagation()}>
                        <div className="mobile-menu-header">
                            <h2>메뉴</h2>
                            <button className="icon-btn" onClick={() => setIsMobileMenuOpen(false)}>×</button>
                        </div>
                        <ul className="mobile-menu-list">
                            {MENU_ITEMS.map((item) => {
                                if (item.requiresVip && user.tier !== 'vip') return null;
                                if (item.requiresAdmin && user.tier !== 'admin') return null;
                                return (
                                    <li key={`mobile-${item.id}`}>
                                        <button
                                            className={`mobile-nav-btn ${activeMenu === item.id ? 'active' : ''}`}
                                            onClick={() => { changeMenu(item.id); setIsMobileMenuOpen(false); }}
                                        >
                                            {item.icon} {item.label}
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
