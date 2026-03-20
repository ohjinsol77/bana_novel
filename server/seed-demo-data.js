import pool, { adjustUserPointBalance, WELCOME_POINT_BONUS } from './db.js';
import { serializeCharacterPayload } from './persona.js';

function formatDateTime(date) {
    const value = new Date(date);
    const parts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(value);
    return parts.replace(' ', 'T').replace('T', ' ');
}

function minutesAgo(base, minutes) {
    return formatDateTime(new Date(base - minutes * 60 * 1000));
}

function buildWriterMessages(pairs, baseTime) {
    const messages = [];
    pairs.forEach((pair, index) => {
        messages.push({
            role: 'user',
            content: pair.user,
            created_at: minutesAgo(baseTime, index * 9 + 8),
        });
        messages.push({
            role: 'assistant',
            content: pair.assistant,
            created_at: minutesAgo(baseTime, index * 9 + 4),
        });
    });
    return messages;
}

async function upsertUser(conn, user) {
    await conn.query(
        `
        INSERT INTO users (
            oauth_id, provider, name, email, profile_img, role,
            is_adult, is_premium, is_suspended, can_publish_community, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            name=VALUES(name),
            email=VALUES(email),
            profile_img=VALUES(profile_img),
            role=VALUES(role),
            is_adult=VALUES(is_adult),
            is_premium=VALUES(is_premium),
            is_suspended=VALUES(is_suspended),
            can_publish_community=VALUES(can_publish_community)
        `,
        [
            user.oauth_id,
            user.provider,
            user.name,
            user.email,
            user.profile_img || null,
            user.role || 'user',
            user.is_adult ? 1 : 0,
            user.is_premium ? 1 : 0,
            user.is_suspended ? 1 : 0,
            user.can_publish_community ? 1 : 0,
            user.created_at,
        ]
    );

    const [rows] = await conn.query(
        'SELECT id FROM users WHERE oauth_id=? AND provider=? LIMIT 1',
        [user.oauth_id, user.provider]
    );

    if (!rows.length) {
        throw new Error(`사용자를 찾을 수 없습니다: ${user.name}`);
    }

    return rows[0].id;
}

async function applySeedPointTransactions(conn, userId, transactions = []) {
    for (const transaction of transactions) {
        const result = await adjustUserPointBalance(conn, {
            userId,
            amount: transaction.amount,
            transactionType: transaction.transactionType,
            note: transaction.note,
            referenceType: transaction.referenceType || null,
            referenceId: transaction.referenceId || null,
            createdBy: transaction.createdBy || null,
        });
        if (transaction.created_at) {
            await conn.query(
                'UPDATE point_transactions SET created_at=? WHERE id=?',
                [transaction.created_at, result.transactionId]
            );
        }
    }
}

async function upsertStory(conn, userId, story) {
    const publicStatus = story.public_status || (story.is_public ? 'approved' : 'private');
    const publicMethod = story.public_method || (story.is_public ? 'approved' : 'private');
    const [existing] = await conn.query(
        'SELECT id FROM stories WHERE user_id=? AND title=? LIMIT 1',
        [userId, story.title]
    );

    let storyId;
    if (existing.length) {
        storyId = existing[0].id;
        await conn.query(
            `
            UPDATE stories
            SET background=?, environment=?, viewer_settings=?, is_public=?, public_status=?, public_method=?, updated_at=?
            WHERE id=?
            `,
            [
                story.background,
                story.environment,
                JSON.stringify(story.viewer_settings),
                story.is_public ? 1 : 0,
                publicStatus,
                publicMethod,
                story.updated_at,
                storyId,
            ]
        );
        await conn.query('DELETE FROM story_messages WHERE story_id=?', [storyId]);
        await conn.query('DELETE FROM story_characters WHERE story_id=?', [storyId]);
    } else {
        const [result] = await conn.query(
            `
            INSERT INTO stories (
                user_id, title, background, environment, viewer_settings,
                is_public, public_status, public_method, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                userId,
                story.title,
                story.background,
                story.environment,
                JSON.stringify(story.viewer_settings),
                story.is_public ? 1 : 0,
                publicStatus,
                publicMethod,
                story.created_at,
                story.updated_at,
            ]
        );
        storyId = result.insertId;
    }

    for (const character of story.characters) {
        const { personaJson } = serializeCharacterPayload(character);
        await conn.query(
            `
            INSERT INTO story_characters (
                story_id, name, persona_json, created_at
            )
            VALUES (?, ?, ?, ?)
            `,
            [storyId, character.name, personaJson, character.created_at]
        );
    }

    for (const message of story.messages) {
        await conn.query(
            `
            INSERT INTO story_messages (
                story_id, user_id, role, content, created_at
            )
            VALUES (?, ?, ?, ?, ?)
            `,
            [storyId, userId, message.role, message.content, message.created_at]
        );
    }

    return storyId;
}

async function main() {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const now = Date.now();
        const users = [
            {
                oauth_id: 'demo_hanul_01',
                provider: 'local',
                name: '박하늘',
                email: 'hanul.park@example.com',
                role: 'user',
                is_adult: 0,
                is_premium: 0,
                is_suspended: 0,
                can_publish_community: 0,
                created_at: minutesAgo(now, 24 * 60 * 3 + 120),
            },
            {
                oauth_id: 'demo_jiho_02',
                provider: 'local',
                name: '이준호',
                email: 'joonho.lee@example.com',
                role: 'user',
                is_adult: 1,
                is_premium: 1,
                is_suspended: 0,
                can_publish_community: 1,
                created_at: minutesAgo(now, 24 * 60 * 2 + 45),
            },
            {
                oauth_id: 'demo_seoa_03',
                provider: 'local',
                name: '김서아',
                email: 'seoa.kim@example.com',
                role: 'user',
                is_adult: 0,
                is_premium: 0,
                is_suspended: 0,
                can_publish_community: 0,
                created_at: minutesAgo(now, 24 * 60 + 30),
            },
        ];

        const userIds = [];
        for (const user of users) {
            userIds.push(await upsertUser(conn, user));
        }

        if (userIds.length) {
            await conn.query('DELETE FROM point_transactions WHERE user_id IN (?)', [userIds]);
            await conn.query('UPDATE users SET point_balance=0 WHERE id IN (?)', [userIds]);
        }

        const pointPlans = [
            [
                {
                    amount: WELCOME_POINT_BONUS,
                    transactionType: 'welcome',
                    note: '회원가입 웰컴 포인트',
                    referenceType: 'auth',
                    created_at: users[0].created_at,
                },
                {
                    amount: 100,
                    transactionType: 'topup',
                    note: '포인트 충전 100P',
                    referenceType: 'topup',
                    created_at: minutesAgo(now, 24 * 60 * 2 + 180),
                },
                {
                    amount: -45,
                    transactionType: 'chat',
                    note: '최근 집필 3회 차감',
                    referenceType: 'story',
                    created_at: minutesAgo(now, 240),
                },
            ],
            [
                {
                    amount: WELCOME_POINT_BONUS,
                    transactionType: 'welcome',
                    note: '회원가입 웰컴 포인트',
                    referenceType: 'auth',
                    created_at: users[1].created_at,
                },
                {
                    amount: 300,
                    transactionType: 'topup',
                    note: '프리미엄 사용자 충전 300P',
                    referenceType: 'topup',
                    created_at: minutesAgo(now, 24 * 60 + 360),
                },
                {
                    amount: -70,
                    transactionType: 'chat',
                    note: '프리미엄 대화 차감',
                    referenceType: 'story',
                    created_at: minutesAgo(now, 180),
                },
                {
                    amount: 40,
                    transactionType: 'admin_grant',
                    note: '이벤트 포인트 지급',
                    referenceType: 'admin',
                    created_at: minutesAgo(now, 90),
                },
            ],
            [
                {
                    amount: WELCOME_POINT_BONUS,
                    transactionType: 'welcome',
                    note: '회원가입 웰컴 포인트',
                    referenceType: 'auth',
                    created_at: users[2].created_at,
                },
                {
                    amount: -15,
                    transactionType: 'chat',
                    note: '첫 집필 사용',
                    referenceType: 'story',
                    created_at: minutesAgo(now, 75),
                },
                {
                    amount: 50,
                    transactionType: 'topup',
                    note: '포인트 충전 50P',
                    referenceType: 'topup',
                    created_at: minutesAgo(now, 40),
                },
            ],
        ];

        for (const [index, transactions] of pointPlans.entries()) {
            await applySeedPointTransactions(conn, userIds[index], transactions);
        }

        const stories = [
            {
                userIndex: 0,
                title: '317번 골목의 비밀식당',
                background: '비 오는 밤, 317번 골목 끝에 간판 없는 식당이 문을 연다. 메뉴판 대신 냄비 뚜껑에 적힌 숫자로 주문이 들어오고, 새벽 손님들은 대개 이름보다 사연이 먼저 있다.',
                environment: '새벽 1시 20분. 골목 바닥엔 얇은 물웅덩이가 번지고, 주방의 노란 조명이 홀로 새어 나온다. 냉장고는 오래됐고, 창문은 반쯤 김이 서려 있다.',
                viewer_settings: {
                    aspectRatio: 'tall',
                    fontFamily: 'Nanum Myeongjo',
                    fontSize: 18,
                    lineHeight: 1.85,
                    showBackground: false,
                    hideUserText: false,
                    userColorR: 91,
                    userColorG: 69,
                    userColorB: 54,
                    aiColorR: 18,
                    aiColorG: 18,
                    aiColorB: 18,
                },
                is_public: 0,
                created_at: minutesAgo(now, 360),
                updated_at: minutesAgo(now, 18),
                characters: [
                    {
                        name: '윤서윤',
                        age: 29,
                        gender: 'female',
                        job: '심야 식당 사장',
                        residence: '서울 중구 을지로 317',
                        personality: ['calm', 'pragmatic', 'protective'],
                        speechStyles: ['friendly', 'gentle'],
                        behaviorRules: ['be_helpful', 'keep_conversation'],
                        customBehaviorRules: '손님이 급하게 말해도 일단 물 한 잔을 내주고 상황을 듣는다.',
                        likes: ['food', 'books', 'cafes'],
                        dislikes: ['rude_people', 'loud_environment'],
                        customDislikes: '무례하게 메뉴를 바꾸는 손님',
                        relationship: 'friend',
                        goals: ['provide_help', 'fun_conversation'],
                        customGoals: '오늘 밤 식당에 들어온 수상한 손님의 비밀을 알아내고 싶다.',
                        background: '낡은 식당을 홀로 운영한다. 말수는 적지만 기억력이 좋아 손님이 남긴 작은 단서를 놓치지 않는다.',
                        created_at: minutesAgo(now, 355),
                    },
                    {
                        name: '강민재',
                        age: 41,
                        gender: 'male',
                        job: '야간 배달 기사',
                        residence: '인천 부평구 14동',
                        personality: ['humorous', 'curious', 'proactive'],
                        speechStyles: ['casual', 'short_sentences'],
                        behaviorRules: ['ask_questions', 'use_humor'],
                        customBehaviorRules: '배고픈 티를 내는 대신 농담으로 대화를 푼다.',
                        likes: ['music', 'food', 'late_night_chat'],
                        dislikes: ['boring_conversation', 'aggressive_language'],
                        customDislikes: '지나치게 따지는 분위기',
                        relationship: 'colleague',
                        goals: ['build_friendship', 'provide_information'],
                        customGoals: '식당에 남겨진 숫자의 의미를 알고 싶다.',
                        background: '오래된 골목을 잘 아는 배달 기사. 동네 소문을 누구보다 빨리 주워온다.',
                        created_at: minutesAgo(now, 350),
                    },
                ],
                messages: buildWriterMessages([
                    {
                        user: '주방 불만 켠 상태로 2시를 넘긴 새벽 장면부터 시작해줘.',
                        assistant: '윤서윤은 찌그러진 냄비 뚜껑을 정리하다가, 문 밖에서 들려오는 빗소리에 잠시 손을 멈췄다. 317번 골목은 늘 조용했지만, 오늘은 이상하게도 발자국 소리가 자꾸 길게 남았다.',
                    },
                    {
                        user: '손님이 메뉴 대신 봉투 하나를 내려놓는 전개를 넣고 싶어.',
                        assistant: '문이 열리자 젖은 외투를 입은 강민재가 들어왔다. 그는 말없이 봉투를 카운터에 올려두었다. 봉투 겉면에는 숫자 네 개만 적혀 있었고, 윤서윤은 그 숫자를 보는 순간 오래된 냉장고 쪽을 돌아봤다.',
                    },
                    {
                        user: '서윤이 냉장고 문을 여는 순간, 안에 있던 걸 보고 멈칫하는 느낌으로.',
                        assistant: '냉장고 안쪽 선반에는 오늘 만들지도 않은 작은 반찬통 하나가 놓여 있었다. 뚜껑 아래에는 손글씨 메모가 붙어 있었고, 메모에는 단 한 줄, "오늘 밤 손님은 셋"이라는 문장이 적혀 있었다. 서윤은 숨을 삼키며 다시 봉투를 바라봤다.',
                    },
                ], now),
            },
            {
                userIndex: 1,
                title: '42층 옥상에서 시작된 로맨스',
                background: '42층 옥상 정원에서 우연히 만난 두 사람이 비슷한 시간에 비슷한 상처를 숨기고 있다. 도시의 불빛 아래에서 가까워지지만, 서로에게 쉽게 이름을 주지 않는다.',
                environment: '밤 11시 10분. 바람이 세고, 난간 아래로는 자동차 불빛이 실처럼 이어진다. 옥상 정원의 작은 조명 두 개만이 꽃잎을 간신히 비춘다.',
                viewer_settings: {
                    aspectRatio: 'wide',
                    fontFamily: 'Noto Serif KR',
                    fontSize: 17,
                    lineHeight: 1.75,
                    showBackground: true,
                    hideUserText: true,
                    userColorR: 60,
                    userColorG: 90,
                    userColorB: 255,
                    aiColorR: 18,
                    aiColorG: 18,
                    aiColorB: 18,
                },
                is_public: 1,
                created_at: minutesAgo(now, 250),
                updated_at: minutesAgo(now, 12),
                characters: [
                    {
                        name: '서지안',
                        age: 34,
                        gender: 'female',
                        job: '야간 사진작가',
                        residence: '부산 해운대구 42층 오피스텔',
                        personality: ['curious', 'emotional', 'proactive'],
                        speechStyles: ['gentle', 'short_sentences'],
                        behaviorRules: ['show_empathy', 'keep_conversation'],
                        customBehaviorRules: '사람을 바로 평가하지 않고, 먼저 풍경부터 바라본다.',
                        likes: ['travel', 'photography', 'music', 'cafes'],
                        dislikes: ['lies', 'loud_environment'],
                        customDislikes: '서둘러 관계를 정의하려는 태도',
                        relationship: 'friend',
                        goals: ['fun_conversation', 'emotional_support'],
                        customGoals: '옥상에서 만난 사람과 자연스럽게 가까워지고 싶다.',
                        background: '밤 풍경을 찍는 일을 하며, 오래된 관계보다 새로 생기는 감정에 더 솔직해지는 편이다.',
                        created_at: minutesAgo(now, 245),
                    },
                    {
                        name: '한도윤',
                        age: 36,
                        gender: 'male',
                        job: '옥상 정원 관리인',
                        residence: '부산 수영구 6번지',
                        personality: ['calm', 'logical', 'protective'],
                        speechStyles: ['formal', 'calm_tone'],
                        behaviorRules: ['be_helpful', 'ask_questions'],
                        customBehaviorRules: '감정을 드러내지 않지만 필요한 말은 끝까지 한다.',
                        likes: ['books', 'travel', 'photography'],
                        dislikes: ['boring_conversation', 'aggressive_language'],
                        customDislikes: '사소한 일로 사람을 몰아붙이는 것',
                        relationship: 'colleague',
                        goals: ['provide_help', 'build_friendship'],
                        customGoals: '옥상 정원의 비밀을 들키지 않고 조용히 지키고 싶다.',
                        background: '낮에는 무뚝뚝하지만 밤이 되면 옥상 식물과 도시 풍경을 가장 오래 보는 사람이다.',
                        created_at: minutesAgo(now, 240),
                    },
                ],
                messages: buildWriterMessages([
                    {
                        user: '옥상 정원에서 우산 하나를 같이 쓰게 되는 장면부터 시작해줘.',
                        assistant: '서지안은 비에 젖은 렌즈 캡을 닦다가, 옆에서 조용히 우산을 들어 주는 남자를 바라봤다. 42층 바람은 생각보다 차가웠고, 두 사람 사이엔 우산보다 더 좁은 거리만 남았다.',
                    },
                    {
                        user: '둘이 서로 이름만 아는 어색한 분위기로, 난간 쪽 대화가 있었으면 해.',
                        assistant: '한도윤은 난간을 바라본 채 "이쪽은 바람이 더 셉니다"라고만 말했다. 지안은 카메라를 내리며 웃었고, 그 짧은 미소 하나가 두 사람의 말문을 이상하게 오래 붙잡아 두었다.',
                    },
                    {
                        user: '지안이 사진을 찍다가 도윤 손목 상처를 발견하는 장면을 넣어줘.',
                        assistant: '셔터 소리가 한 번 울리고, 지안의 시선이 도윤의 손목으로 떨어졌다. 얇은 붕대 아래로 새 빨간 선이 비쳤다. 도윤은 시선을 피했지만, 지안은 그 상처가 단순한 흠집이 아니라는 걸 본능적으로 알아차렸다.',
                    },
                ], now),
            },
            {
                userIndex: 2,
                title: '0.7초 뒤의 재난예측국',
                background: '0.7초 단위로 갱신되는 재난 예측 시스템이 매일 도시의 위험을 계산한다. 그런데 어느 날부터 예측 결과가 조금씩 어긋나기 시작하고, 그 오차는 누군가의 손길처럼 보인다.',
                environment: '세종 19층 통제실. 천장 경보등이 번쩍이고, 벽면의 대형 모니터 12대가 동시에 서로 다른 숫자를 띄운다. 공기에는 커피와 전기 냄새가 섞여 있다.',
                viewer_settings: {
                    aspectRatio: 'standard',
                    fontFamily: 'Nanum Gothic',
                    fontSize: 20,
                    lineHeight: 1.9,
                    showBackground: false,
                    hideUserText: false,
                    userColorR: 54,
                    userColorG: 140,
                    userColorB: 96,
                    aiColorR: 18,
                    aiColorG: 18,
                    aiColorB: 18,
                },
                is_public: 0,
                created_at: minutesAgo(now, 150),
                updated_at: minutesAgo(now, 6),
                characters: [
                    {
                        name: '한도윤',
                        age: 27,
                        gender: 'male',
                        job: '재난예측국 분석관',
                        residence: '세종시 19동',
                        personality: ['logical', 'analytical', 'calm'],
                        speechStyles: ['formal', 'explanatory'],
                        behaviorRules: ['be_helpful', 'keep_conversation'],
                        customBehaviorRules: '데이터를 먼저 보고 감정은 마지막에 정리한다.',
                        likes: ['technology', 'books', 'music'],
                        dislikes: ['lies', 'aggressive_language'],
                        customDislikes: '숫자를 대충 넘기는 태도',
                        relationship: 'colleague',
                        goals: ['provide_information', 'provide_help'],
                        customGoals: '예측값의 오류 원인을 스스로 찾아내고 싶다.',
                        background: '재난 예측 모델을 다루는 신입 분석관. 숫자 하나의 이상도 그냥 넘어가지 않는다.',
                        created_at: minutesAgo(now, 145),
                    },
                    {
                        name: '유하린',
                        age: 39,
                        gender: 'female',
                        job: '재난예측국 팀장',
                        residence: '대전 유성구 8동',
                        personality: ['charismatic', 'pragmatic', 'protective'],
                        speechStyles: ['formal', 'direct'],
                        behaviorRules: ['stay_positive', 'ask_questions'],
                        customBehaviorRules: '위기 때는 짧게 말하고 길게 책임진다.',
                        likes: ['technology', 'travel', 'late_night_chat'],
                        dislikes: ['boring_conversation', 'loud_environment'],
                        customDislikes: '애매한 보고서',
                        relationship: 'mentor',
                        goals: ['provide_help', 'emotional_support'],
                        customGoals: '팀을 지키면서도 오차의 진짜 원인을 밝혀내고 싶다.',
                        background: '현장을 오래 겪어 숫자보다 사람을 먼저 떠올리는 팀장이다. 그래도 데이터는 누구보다 빨리 읽는다.',
                        created_at: minutesAgo(now, 140),
                    },
                ],
                messages: buildWriterMessages([
                    {
                        user: '0.7초 뒤에 정전이 오는 첫 장면으로 시작하고 싶어.',
                        assistant: '한도윤이 첫 모니터를 확인한 순간, 화면 우측 상단의 숫자가 0.7초 늦게 깜빡였다. 경보음은 아직 울리지 않았는데 통제실 안의 공기가 먼저 식어 갔다.',
                    },
                    {
                        user: '주인공이 19층 통제실에서 로그를 확인하는데 숫자가 하나 이상하다는 느낌으로.',
                        assistant: '로그 마지막 줄에 찍힌 값은 분명 정상 범위였지만, 한도윤은 그 수치가 오늘 따라 유난히 가볍게 보인다는 걸 느꼈다. 유하린은 그의 어깨 너머로 화면을 보며 "누가 만졌네"라고 낮게 말했다.',
                    },
                    {
                        user: '마지막엔 누군가가 일부러 예측값을 바꿨다는 암시를 남겨줘.',
                        assistant: '창문 없는 통제실의 불빛이 한 번 더 꺼졌다 켜졌다. 그 짧은 순간, 한도윤은 로그에 없는 접속 기록 하나를 발견했다. 시간은 0.7초 차이였고, 접속 주체는 사람도 시스템도 아닌 듯했다.',
                    },
                ], now),
            },
        ];

        for (const story of stories) {
            const storyId = await upsertStory(conn, userIds[story.userIndex], story);
            console.log(`seeded story #${storyId}: ${story.title}`);
        }

        await conn.commit();
        console.log('✅ demo seed complete');
    } catch (err) {
        await conn.rollback();
        console.error('❌ demo seed failed:', err);
        throw err;
    } finally {
        conn.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
