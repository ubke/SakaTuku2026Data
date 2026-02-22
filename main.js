// アプリの状態
let players = JSON.parse(localStorage.getItem('sakatsuku_players')) || [];
let teams = JSON.parse(localStorage.getItem('sakatsuku_teams')) || ['初期チーム'];
let currentTeam = teams[0]; // 現在選択されているチーム

let currentPaintColor = 'red'; 
let currentPhase = '安定期';

// SortableJSを管理する変数
let sortableInstance = null;
let teamSortableInstance = null; // チームタブ用のSortableJS管理変数

// 現在編集中の選手のIDを記憶する変数
let editingPlayerId = null;

const PITCH_POSITIONS = [
    'LW', 'CF', 'RW',
    'LM', 'AM', 'RM',
    'DM',
    'LB', 'CB', 'RB',
    'GK'
];

document.addEventListener('DOMContentLoaded', () => {
    // 1. 各種初期化処理
    migrateOldData();
    initTabs();
    initPositions();
    initFilterPositions(); 
    initPitchGrid();
    initPalette();
    initPhases();
    renderPlayers();

    // 2. クラブ追加機能を復活
    const addTeamBtn = document.querySelector('.btn-tab-add');
    const newTeamInput = document.querySelector('.tab-input-group input');
    if (addTeamBtn && newTeamInput) {
        addTeamBtn.onclick = () => {
            const teamName = newTeamInput.value.trim();
            if (teamName !== '') {
                if (!teams.includes(teamName)) {
                    teams.push(teamName);
                    localStorage.setItem('sakatsuku_teams', JSON.stringify(teams));
                }
                currentTeam = teamName;
                newTeamInput.value = '';
                initTabs();
                renderPlayers();
            }
        };
    }

    // 3. フォーム開閉と保存ボタン（エラー回避＆二重起動防止）
    const toggleBtn = document.getElementById('toggleFormBtn');
    if (toggleBtn) toggleBtn.onclick = () => toggleForm(false);
    
    const saveBtn = document.getElementById('savePlayerBtn');
    if (saveBtn) saveBtn.onclick = addPlayer;
    
    const cancelBtn = document.getElementById('cancelFormBtn');
    if (cancelBtn) cancelBtn.onclick = () => toggleForm(true);

    // 4. 総合力の「＋」ボタン処理
    const upBtn = document.getElementById('btnRatingUp');
    if (upBtn) {
        upBtn.onclick = () => {
            const input = document.getElementById('pRating');
            let val = parseInt(input.value) || 0;
            input.value = Math.ceil((val + 1) / 500) * 500;
        };
    }

    // 5. 総合力の「ー」ボタン処理
    const downBtn = document.getElementById('btnRatingDown');
    if (downBtn) {
        downBtn.onclick = () => {
            const input = document.getElementById('pRating');
            let val = parseInt(input.value) || 0;
            let newVal = Math.floor((val - 1) / 500) * 500;
            input.value = newVal < 0 ? 0 : newVal;
        };
    }

    // 6. 【選手登録用】のアビリティ発動条件ボタン
    document.querySelectorAll('.ability-btn').forEach(btn => {
        btn.onclick = () => btn.classList.toggle('selected');
    });

    // 7. 【絞り込み用】のアビリティ発動条件ボタン
    document.querySelectorAll('.filter-ability-btn').forEach(btn => {
        btn.onclick = () => {
            btn.classList.toggle('selected');
            renderPlayers();
        };
    });

    // 相性ドロップダウンの開閉処理
    const chemTrigger = document.getElementById('chemSelectTrigger');
    const chemWrapper = document.getElementById('chemSelectWrapper');
    if (chemTrigger && chemWrapper) {
        chemTrigger.addEventListener('click', (e) => {
            chemWrapper.classList.toggle('open');
            e.stopPropagation();
        });
        // 外側をクリックしたら閉じる
        document.addEventListener('click', (e) => {
            if (!chemWrapper.contains(e.target)) chemWrapper.classList.remove('open');
        });
    }
});

// 過去に保存した選手（チーム未所属）を「初期チーム」に割り当てる処理
function migrateOldData() {
    let migrated = false;
    players.forEach(p => {
        if (!p.team) {
            p.team = teams[0];
            migrated = true;
        }
    });
    if (migrated) {
        localStorage.setItem('sakatsuku_players', JSON.stringify(players));
    }
}

// チームタブの生成とドラッグ＆ドロップ制御（更新版）
function initTabs() {
    const container = document.getElementById('teamTabsContainer');
    container.innerHTML = '';

    // タブが再描画されるタイミングで、登録ボタンのクラブ名も更新する！
    const toggleBtn = document.getElementById('toggleFormBtn');
    const form = document.getElementById('addPlayerForm');
    // フォームが閉じている（「× キャンセル」になっていない）時だけ文字を更新
    if (toggleBtn && (!form || form.style.display === 'none' || form.style.display === '')) {
        toggleBtn.textContent = `＋ ${currentTeam} に選手を登録`;
    }

    teams.forEach(team => {
        const tab = document.createElement('div');
        tab.className = `team-pill ${team === currentTeam ? 'active' : ''}`;
        tab.dataset.team = team;

        // チーム名の文字部分
        const nameSpan = document.createElement('span');
        nameSpan.textContent = team;
        nameSpan.style.flex = '1';
        tab.appendChild(nameSpan);

        // 文字（nameSpan）ではなく、枠全体（tab）にクリック判定をつける
        tab.addEventListener('click', () => {
            currentTeam = team;
            initTabs(); 
            renderPlayers(); 
            const form = document.getElementById('addPlayerForm');
            if (form.style.display === 'block') toggleForm();
        });

        // ダブルクリックでクラブ名を変更
        tab.addEventListener('dblclick', (e) => {
            e.stopPropagation(); // 誤作動を防ぐ
            
            // 入力ポップアップを表示（初期値として現在の名前を入れておく）
            const newTeamName = prompt('新しいクラブ名を入力してください:', team);
            
            if (newTeamName !== null) { // キャンセルを押さなかった場合
                const trimmedName = newTeamName.trim();
                
                if (trimmedName === team) {
                    return; // 名前が変わっていない場合は何もしない
                }
                
                if (trimmedName === '') {
                    alert('クラブ名を空にはできません。');
                    return;
                }
                
                if (teams.includes(trimmedName)) {
                    alert('そのクラブ名は既に存在します！');
                    return;
                }
                
                // 1. クラブ一覧（teams）の該当する名前を書き換える
                const teamIndex = teams.indexOf(team);
                teams[teamIndex] = trimmedName;
                
                // 2. もし今開いているクラブの名前を変えたなら、現在選択中の状態も書き換える
                if (currentTeam === team) {
                    currentTeam = trimmedName;
                }
                
                // 3. このクラブに所属している「全選手」のデータも新しいクラブ名に書き換える
                players.forEach(p => {
                    if (p.team === team) {
                        p.team = trimmedName;
                    }
                });
                
                // 4. 全てのデータを保存して、画面を最新状態に更新する
                localStorage.setItem('sakatsuku_teams', JSON.stringify(teams));
                localStorage.setItem('sakatsuku_players', JSON.stringify(players));
                initTabs();
                renderPlayers();
            }
        });

        // 削除ボタン (×) ※チームが1つしかない場合は消せない
        if (teams.length > 1) {
            const delBtn = document.createElement('span');
            delBtn.className = 'delete-tab-btn';
            delBtn.textContent = '×';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                
                // 1回目の確認ポップアップ
                if (confirm(`クラブ「${team}」を削除しますか？\n（所属している選手のデータもすべて削除されます）`)) {
                    // 1回目でOKを押した場合のみ、2回目の確認ポップアップを出す
                    if (confirm(`本当にクラブ「${team}」を削除してもよろしいですか？\n（所属している選手のデータもすべて削除されます）`)) {
                        teams = teams.filter(t => t !== team);
                        players = players.filter(p => p.team !== team);
                        localStorage.setItem('sakatsuku_teams', JSON.stringify(teams));
                        localStorage.setItem('sakatsuku_players', JSON.stringify(players));
                        
                        if (currentTeam === team) currentTeam = teams[0];
                        initTabs();
                        renderPlayers();
                    }
                }
            });
            tab.appendChild(delBtn);
        }

        container.appendChild(tab);
    });

    // タブのSortableJS設定
    if (teamSortableInstance) teamSortableInstance.destroy();
    
    teamSortableInstance = new Sortable(container, {
        animation: 200,
        ghostClass: 'team-pill-ghost',
        filter: '.delete-tab-btn',
        
        // タップとドラッグを明確に区別するための設定
        delay: 300,             // 長押しと判定するまでの時間（300ミリ秒 = 0.3秒）
        delayOnTouchOnly: true, // スマホ等のタッチ操作の時だけ長押しを要求する（PCマウスはすぐ掴めるようにする）
        touchStartThreshold: 5, // 長押し中に指が少し（5px）ブレてもキャンセルせずタップとして許容する「遊び」
        
        onEnd: function () {
            const newTeams = Array.from(container.children).map(tab => tab.dataset.team);
            teams = newTeams;
            localStorage.setItem('sakatsuku_teams', JSON.stringify(teams));
        }
    });
}

function initPositions() {
    const optionsList = document.getElementById('posOptionsList');
    const hiddenInput = document.getElementById('pPos');
    const trigger = document.getElementById('posSelectTrigger');
    const label = document.getElementById('posSelectLabel');
    const wrapper = document.getElementById('posSelectWrapper');
    
    optionsList.innerHTML = ''; 

    GAME_DATA.positions.forEach((pos, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'custom-option';
        optionDiv.textContent = `${pos.id} (${pos.name})`;
        optionDiv.style.backgroundColor = pos.color;

        optionDiv.addEventListener('click', function() {
            hiddenInput.value = pos.id;
            label.textContent = `${pos.id} (${pos.name})`;
            trigger.style.backgroundColor = pos.color;
            trigger.style.color = 'white';
            wrapper.classList.remove('open');

            document.querySelectorAll('#formPitchGrid .pitch-cell').forEach(c => {
                c.removeAttribute('data-apt');
            });

            const cell = document.querySelector(`.pitch-cell[data-pos="${pos.id}"]`);
            if (cell) cell.setAttribute('data-apt', 'red');
        });

        optionsList.appendChild(optionDiv);

        if (index === 0) {
            hiddenInput.value = pos.id;
            label.textContent = `${pos.id} (${pos.name})`;
            trigger.style.backgroundColor = pos.color;
            trigger.style.color = 'white';
        }
    });

    trigger.addEventListener('click', function(e) {
        wrapper.classList.toggle('open');
        e.stopPropagation();
    });

    document.addEventListener('click', function(e) {
        if (!wrapper.contains(e.target)) wrapper.classList.remove('open');
    });
}

// 絞り込み用のポジションセレクトボックスを初期化する
function initFilterPositions() {
    const filterList = document.getElementById('filterPosOptionsList');
    filterList.innerHTML = ''; 

    // 1. 「すべて表示」の選択肢を追加
    const allOption = document.createElement('div');
    allOption.className = 'custom-option';
    allOption.textContent = 'すべて表示';
    allOption.style.backgroundColor = '#374151'; // 少し暗いグレー
    allOption.addEventListener('click', () => {
        document.getElementById('filterPosSelect').value = '';
        document.getElementById('filterPosSelectLabel').textContent = 'すべて表示';
        // 初期状態の見た目に戻す
        const trigger = document.getElementById('filterPosSelectTrigger');
        trigger.style.backgroundColor = 'rgba(31, 41, 55, 0.9)'; 
        trigger.style.color = 'white';
        document.getElementById('filterPosSelectWrapper').classList.remove('open');
        renderPlayers(); // ★選択した瞬間に絞り込み実行
    });
    filterList.appendChild(allOption);

    // 2. 各ポジションの選択肢を追加
    GAME_DATA.positions.forEach(pos => {
        const option = document.createElement('div');
        option.className = 'custom-option';
        // 選手登録フォームと同じ表示形式にする
        option.textContent = pos.name ? `${pos.id}（${pos.name}）` : pos.id; 
        option.style.backgroundColor = pos.color;
        
        option.addEventListener('click', () => {
            document.getElementById('filterPosSelect').value = pos.id;
            document.getElementById('filterPosSelectLabel').textContent = pos.name ? `${pos.id}（${pos.name}）` : pos.id;
            // 選択したポジションの色に変更する
            const trigger = document.getElementById('filterPosSelectTrigger');
            trigger.style.backgroundColor = pos.color;
            trigger.style.color = 'white';
            document.getElementById('filterPosSelectWrapper').classList.remove('open');
            renderPlayers(); // ★選択した瞬間に絞り込み実行
        });
        filterList.appendChild(option);
    });

    // 3. クリックでドロップダウンを開閉する処理
    document.getElementById('filterPosSelectTrigger').addEventListener('click', () => {
        document.getElementById('filterPosSelectWrapper').classList.toggle('open');
    });
}

function initPitchGrid() {
    const grid = document.getElementById('formPitchGrid');
    grid.innerHTML = '';

    PITCH_POSITIONS.forEach(pos => {
        const cell = document.createElement('div');
        cell.className = 'pitch-cell';
        cell.dataset.pos = pos;
        cell.textContent = pos;
        
        cell.addEventListener('click', () => {
            if (currentPaintColor === 'none') {
                cell.removeAttribute('data-apt');
            } else {
                if (cell.getAttribute('data-apt') === currentPaintColor) {
                    cell.removeAttribute('data-apt');
                } else {
                    cell.setAttribute('data-apt', currentPaintColor);
                }
            }
        });
        grid.appendChild(cell);
    });
}

function initPalette() {
    const btns = document.querySelectorAll('.palette-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentPaintColor = btn.dataset.color;
        });
    });
}

function initPhases() {
    const btns = document.querySelectorAll('.phase-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentPhase = btn.dataset.phase;
        });
    });
}

// フォームの表示/非表示
function toggleForm(forceClose = false) {
    const isForceClose = forceClose === true;
    const form = document.getElementById('addPlayerForm');
    const btn = document.getElementById('toggleFormBtn');
    
    if (!form || !btn) return;
    
    btn.insertAdjacentElement('afterend', form);
    const isAlreadyOpenAsNew = (form.style.display === 'block' && editingPlayerId === null);

    if (isForceClose || isAlreadyOpenAsNew) {
        // ▼ 閉じる時の処理
        const savedEditId = editingPlayerId; // ★ ここで「どの選手を編集していたか」を記憶する

        form.style.display = 'none';
        btn.textContent = `＋ ${currentTeam} に選手を登録`;
        btn.classList.remove('btn-cancel');
        
        document.querySelectorAll('.player-card').forEach(c => c.style.opacity = '1');
        editingPlayerId = null;

        // ★ 保存時・キャンセル時共通のスクロール処理
        setTimeout(() => {
            if (savedEditId) {
                // 編集だった場合：その選手のカードへ戻る
                const card = document.getElementById(`player-card-${savedEditId}`);
                if (card) {
                    const y = card.getBoundingClientRect().top + window.pageYOffset - 100;
                    window.scrollTo({ top: y, behavior: 'smooth' });
                }
            } else {
                // 新規登録だった場合：一番上へ戻る
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }, 50);

    } else {
        // ▼ 新規登録として開く時の処理
        form.style.display = 'block';
        btn.textContent = '× キャンセル';
        btn.classList.add('btn-cancel');
        
        const saveBtn = document.getElementById('savePlayerBtn');
        if (saveBtn) saveBtn.textContent = '保存する';
        
        document.querySelectorAll('.player-card').forEach(c => c.style.opacity = '1');
        editingPlayerId = null;

        // フォームのリセット
        const pName = document.getElementById('pName');
        if (pName) pName.value = '';
        const pRating = document.getElementById('pRating');
        if (pRating) pRating.value = '4500';

        document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('selected'));
        const defaultPalette = document.querySelector('.palette-btn[data-color="red"]');
        if (defaultPalette) defaultPalette.classList.add('selected');
        currentPaintColor = 'red';

        document.querySelectorAll('#formPitchGrid .pitch-cell').forEach(c => c.removeAttribute('data-apt'));
        const pPos = document.getElementById('pPos');
        if (pPos && pPos.value) {
            const cell = document.querySelector(`.pitch-cell[data-pos="${pPos.value}"]`);
            if (cell) cell.setAttribute('data-apt', 'red');
        }

        document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('selected'));
        const defaultPhase = document.querySelector('.phase-btn[data-phase="安定期"]');
        if (defaultPhase) defaultPhase.classList.add('selected');
        currentPhase = '安定期';

        document.querySelectorAll('.ability-btn').forEach(b => b.classList.remove('selected'));
        
        // 新規登録時は「相性エリア」を隠す
        const chemistryGroup = document.getElementById('chemistryGroup');
        if (chemistryGroup) chemistryGroup.style.display = 'none';
    }
}

// 選手を編集モードで開く
function editPlayer(id) {
    const player = players.find(p => p.id === id);
    if (!player) return;

    editingPlayerId = id;
    const form = document.getElementById('addPlayerForm');
    const card = document.getElementById(`player-card-${id}`);

    // ★フォームを、対象の選手カードのすぐ下に瞬間移動させる！
    card.insertAdjacentElement('afterend', form);
    form.style.display = 'block';

    // UIの切り替え
    document.getElementById('savePlayerBtn').textContent = '更新する';
    const topBtn = document.getElementById('toggleFormBtn');
    topBtn.textContent = `＋ ${currentTeam} に選手を登録`;
    topBtn.classList.remove('btn-cancel');

    // 編集中のカード以外を少し暗くして分かりやすくする
    document.querySelectorAll('.player-card').forEach(c => c.style.opacity = '1');
    card.style.opacity = '0.4';

    // データのセット
    document.getElementById('pName').value = player.name;
    document.getElementById('pRating').value = player.rating || 0;
    
    document.getElementById('pPos').value = player.position;
    const posData = GAME_DATA.positions.find(p => p.id === player.position);
    if (posData) {
        const trigger = document.querySelectorAll('.custom-select-trigger')[0]; 
        if (trigger) {
            const label = trigger.querySelector('span:first-child') || trigger;
            label.textContent = posData.name ? `${posData.id}（${posData.name}）` : posData.id;
            trigger.style.backgroundColor = posData.color;
            trigger.style.color = 'white';
        }
    }

    document.querySelectorAll('#formPitchGrid .pitch-cell').forEach(c => c.removeAttribute('data-apt'));
    if (player.aptitudes) {
        Object.keys(player.aptitudes).forEach(pos => {
            const cell = document.querySelector(`#formPitchGrid .pitch-cell[data-pos="${pos}"]`);
            if (cell) cell.setAttribute('data-apt', player.aptitudes[pos]);
        });
    }

    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('selected'));
    if (player.phase) {
        const phaseBtn = document.querySelector(`.phase-btn[data-phase="${player.phase}"]`);
        if (phaseBtn) phaseBtn.classList.add('selected');
        currentPhase = player.phase;
    }

    document.querySelectorAll('.ability-btn').forEach(b => b.classList.remove('selected'));
    if (player.abilities) {
        player.abilities.forEach(cond => {
            const btn = document.querySelector(`.ability-btn[data-cond="${cond}"]`);
            if (btn) btn.classList.add('selected');
        });
    }

    // 相性の良い選手リストを自動生成して表示する
    const chemistryGroup = document.getElementById('chemistryGroup');
    const chemistryList = document.getElementById('chemistryList');
    const chemTagsArea = document.getElementById('chemTagsArea');
    
    if (chemistryGroup && chemistryList && chemTagsArea) {
        chemistryGroup.style.display = 'block';
        chemistryList.innerHTML = '';
        chemTagsArea.innerHTML = '';

        const teammates = players.filter(p => p.team === currentTeam && p.id !== id);

        // ★追加：普段のリストと同じ「ポジション順 → 総合力順」に並び替える
        teammates.sort((a, b) => {
            const posIndexA = GAME_DATA.positions.findIndex(p => p.id === a.position);
            const posIndexB = GAME_DATA.positions.findIndex(p => p.id === b.position);
            const sortPosA = posIndexA !== -1 ? posIndexA : 99;
            const sortPosB = posIndexB !== -1 ? posIndexB : 99;

            if (sortPosA !== sortPosB) {
                return sortPosA - sortPosB;
            }
            const ratingA = a.rating || 0;
            const ratingB = b.rating || 0;
            return ratingB - ratingA;
        });

        if (teammates.length === 0) {
            chemistryList.innerHTML = '<div style="padding: 12px; font-size: 0.9rem; color: #9CA3AF; text-align: center;">同じクラブに他の選手がいません。</div>';
        } else {
            const renderChemTags = () => {
                chemTagsArea.innerHTML = '';
                document.querySelectorAll('.chemistry-option.selected').forEach(opt => {
                    const tag = document.createElement('div');
                    tag.className = 'chem-tag';
                    
                    // ★修正：ポジションバッジと名前を抜き出してタグを作る
                    const posBadge = opt.querySelector('.chem-pos-badge').outerHTML;
                    const playerName = opt.querySelector('.chem-player-name').textContent;
                    
                    tag.innerHTML = `
                        ${posBadge} <span style="margin-left: 2px;">${playerName}</span>
                        <span class="chem-tag-close" data-id="${opt.dataset.id}">✕</span>
                    `;
                    
                    tag.querySelector('.chem-tag-close').addEventListener('click', (e) => {
                        e.stopPropagation(); 
                        opt.classList.remove('selected');
                        renderChemTags(); 
                    });
                    chemTagsArea.appendChild(tag);
                });
            };

            teammates.forEach(tm => {
                const option = document.createElement('div');
                option.className = 'chemistry-option';
                option.dataset.id = tm.id;    

                // ★追加：ポジションのデータと色を取得
                const posData = GAME_DATA.positions.find(p => p.id === tm.position);
                const posColor = posData ? posData.color : '#9CA3AF'; 
                const posName = posData ? posData.id : tm.position;

                // ★修正：左側にポジションバッジを表示するHTML構造
                option.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="chem-pos-badge" style="background-color: ${posColor};">${posName}</span>
                        <span class="chem-player-name">${tm.name}</span>
                    </div>
                `;
                
                if (player.chemistry && player.chemistry.includes(tm.id)) {
                    option.classList.add('selected');
                }

                option.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    option.classList.toggle('selected');
                    renderChemTags(); 
                });

                chemistryList.appendChild(option);
            });

            renderChemTags();
        }
    }
}

// 選手の追加・更新と保存
function addPlayer() {
    const name = document.getElementById('pName').value.trim();
    const rating = document.getElementById('pRating').value;
    const pos = document.getElementById('pPos').value;

    if (!name) {
        alert('選手名を入力してください');
        return;
    }

    const aptitudes = {};
    document.querySelectorAll('#formPitchGrid .pitch-cell').forEach(cell => {
        if (cell.dataset.pos && cell.dataset.apt) {
            aptitudes[cell.dataset.pos] = cell.dataset.apt;
        }
    });

    const abilities = [];
    document.querySelectorAll('.ability-btn.selected').forEach(btn => {
        abilities.push(btn.dataset.cond);
    });

    // 編集モードの場合、選択された相性の良い選手のIDを集める
    let newChemistry = [];
    if (editingPlayerId) {
        // ★クラス名が .chemistry-option になりました
        document.querySelectorAll('.chemistry-option.selected').forEach(opt => {
            newChemistry.push(parseInt(opt.dataset.id, 10));
        });
    }

    // ★修正：既存の if (editingPlayerId) { ... } の中身を以下に差し替え
    if (editingPlayerId) {
        // ★ 更新モード
        const playerIndex = players.findIndex(p => p.id === editingPlayerId);
        if (playerIndex !== -1) {
            const p = players[playerIndex];
            p.name = name;
            p.rating = rating ? parseInt(rating, 10) : 0;
            p.position = pos;
            p.aptitudes = aptitudes;
            p.phase = currentPhase;
            p.abilities = abilities;
            
            // ▼ プロの技：双方向リンクの自動更新処理
            const oldChemistry = p.chemistry || [];
            p.chemistry = newChemistry;

            // 1. 新しく相性に選ばれた相手のデータにも、自分を自動追加する
            const addedIds = newChemistry.filter(id => !oldChemistry.includes(id));
            addedIds.forEach(targetId => {
                const target = players.find(t => t.id === targetId);
                if (target) {
                    if (!target.chemistry) target.chemistry = [];
                    if (!target.chemistry.includes(editingPlayerId)) {
                        target.chemistry.push(editingPlayerId);
                    }
                }
            });

            // 2. 相性から外された（チェックを消した）相手のデータから、自分を自動削除する
            const removedIds = oldChemistry.filter(id => !newChemistry.includes(id));
            removedIds.forEach(targetId => {
                const target = players.find(t => t.id === targetId);
                if (target && target.chemistry) {
                    target.chemistry = target.chemistry.filter(id => id !== editingPlayerId);
                }
            });
        }
    } else {
        // ★ 新規追加モード（この中身も差し替えてください）
        const newPlayer = {
            id: Date.now(),
            name: name,
            rating: rating ? parseInt(rating, 10) : 0,
            position: pos,
            aptitudes: aptitudes,
            phase: currentPhase,
            abilities: abilities,
            team: currentTeam,
            chemistry: [] // ★追加：新規登録時は空の相性リストを持たせる
        };
        players.push(newPlayer);
    }

    localStorage.setItem('sakatsuku_players', JSON.stringify(players));
    
    // スクロール処理は toggleForm 内で自動的に行われるため、呼び出すだけでOK
    toggleForm(true); 
    renderPlayers();
}

window.deletePlayer = function(id) {
    if(confirm('この選手を削除しますか？')) {
        // ★追加：他の選手の相性リストから、この削除される選手の存在を完全に消し去る
        players.forEach(p => {
            if (p.chemistry) {
                p.chemistry = p.chemistry.filter(cid => cid !== id);
            }
        });
        
        players = players.filter(p => p.id !== id);
        localStorage.setItem('sakatsuku_players', JSON.stringify(players));
        renderPlayers();
    }
};

// 選手リストの描画（絞り込み＆ソート機能付き）
function renderPlayers() {
    const list = document.getElementById('playerList');

    // リストを消す前に、フォームがリスト内にあれば安全な場所（上部）に退避させる
    const form = document.getElementById('addPlayerForm');
    if (list.contains(form)) {
        toggleForm(true); // フォームを閉じて上に戻す
    }

    list.innerHTML = '';

    const teamPlayers = players.filter(player => player.team === currentTeam);

    if (teamPlayers.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color: #9CA3AF;">${currentTeam} にはまだ選手が登録されていません。</div>`;
        return;
    }

    // 1. 絞り込み条件の取得
    const filterPos = document.getElementById('filterPosSelect').value;
    const filterAbilities = Array.from(document.querySelectorAll('.filter-ability-btn.selected')).map(btn => btn.dataset.cond);

    // 2. 選手の絞り込み処理
    const targetPlayers = teamPlayers.filter(player => {
        // --- アビリティによる絞り込み（選択した条件をすべて満たす選手を残す） ---
        let matchAbility = true;
        if (filterAbilities.length > 0) {
            if (!player.abilities) {
                matchAbility = false;
            } else {
                matchAbility = filterAbilities.every(cond => player.abilities.includes(cond));
            }
        }

        // --- ポジション適性による絞り込み（サブポジのマップ色も判定する） ---
        let matchPos = true;
        if (filterPos !== "") {
            const isMainPos = player.position === filterPos;
            // 赤=最適, orange=適正, yellow=弱め
            const hasAptitude = player.aptitudes && (player.aptitudes[filterPos] === 'red' || player.aptitudes[filterPos] === 'orange' || player.aptitudes[filterPos] === 'yellow');
            
            if (!isMainPos && !hasAptitude) {
                matchPos = false; // 本職でもなく、マップに適性も塗られていない場合は除外
            }
        }

        return matchAbility && matchPos;
    });

    if (targetPlayers.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color: #9CA3AF;">条件に一致する選手が見つかりません。</div>`;
        return;
    }

    // 3. 表示順の並び替え（ソート）処理
    targetPlayers.sort((a, b) => {
        // --- ★特別ルール：ポジションで絞り込んでいる場合は「適性レベルが高い順」を最優先する ---
        if (filterPos !== "") {
            const getAptScore = (p) => {
                if (p.position === filterPos) return 4; // 本職が最強
                if (!p.aptitudes) return 0;
                if (p.aptitudes[filterPos] === 'red') return 3;    // 最適（赤）
                if (p.aptitudes[filterPos] === 'orange') return 2; // 適正（オレンジ）
                if (p.aptitudes[filterPos] === 'yellow') return 1; // 弱め（黄色）
                return 0; // 適性なし
            };
            
            const scoreA = getAptScore(a);
            const scoreB = getAptScore(b);
            
            if (scoreA !== scoreB) {
                return scoreB - scoreA; // スコアが高い選手を上に持ってくる
            }
        }

        // --- 以降は通常の並び替え（ポジション順 → 総合力順） ---
        const posIndexA = GAME_DATA.positions.findIndex(p => p.id === a.position);
        const posIndexB = GAME_DATA.positions.findIndex(p => p.id === b.position);
        const sortPosA = posIndexA !== -1 ? posIndexA : 99;
        const sortPosB = posIndexB !== -1 ? posIndexB : 99;

        if (sortPosA !== sortPosB) {
            return sortPosA - sortPosB;
        }

        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        return ratingB - ratingA;
    });

    // 4. HTMLの生成（ここから下は変更ありません）
    targetPlayers.forEach(player => {
        const posData = GAME_DATA.positions.find(p => p.id === player.position);
        const posColor = posData ? posData.color : '#9CA3AF'; 
        const posName = posData ? posData.id : player.position;
        const phaseName = player.phase || '未設定';

        let miniMapHtml = '<div class="mini-pitch">';
        PITCH_POSITIONS.forEach(pos => {
            const aptColor = (player.aptitudes && player.aptitudes[pos]) ? player.aptitudes[pos] : '';
            miniMapHtml += `<div class="mini-cell" data-pos="${pos}" data-apt="${aptColor}"></div>`;
        });
        miniMapHtml += '</div>';

        const ratingHtml = player.rating > 0 ? `<div class="player-rating">${player.rating}</div>` : '';

        const abilitiesHtml = (player.abilities && player.abilities.length > 0)
            ? `<div class="ability-tags">${player.abilities.map(a => `<span class="ability-tag">${a}</span>`).join('')}</div>`
            : '';

        // 相性の良い選手の名前を抽出して表示するHTML
        let chemistryHtml = '';
        if (player.chemistry && player.chemistry.length > 0) {
            const chemNames = player.chemistry.map(id => {
                const target = players.find(p => p.id === id);
                return target ? target.name : null;
            }).filter(name => name !== null);

            if (chemNames.length > 0) {
                chemistryHtml = `<div style="margin-top: 8px; font-size: 0.85rem; color: rgba(255,255,255,0.8); background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 6px; border-left: 3px solid var(--accent-cyan);">
                    <span style="color: var(--accent-cyan); font-weight: bold;">連携：</span> ${chemNames.join('、')}
                </div>`;
            }
        }

        const card = document.createElement('div');
        card.className = 'player-card';
        card.id = `player-card-${player.id}`; // カードに固有の目印をつける

        card.innerHTML = `
            <div class="card-header">
                <div class="card-header-left">
                    <div class="player-pos" style="background-color: ${posColor};">${posName}</div>
                    <div class="player-name">${player.name}</div>
                </div>
                ${ratingHtml}
            </div>
            <div class="card-body">
                <div style="flex: 1; margin-right: 10px;">
                    <div style="margin-bottom: 8px;">
                        <span class="player-phase" data-phase="${phaseName}">${phaseName}</span>
                    </div>
                    ${abilitiesHtml}
                    ${chemistryHtml}
                </div>
                ${miniMapHtml}
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 15px; margin-top: 10px;">
                <button onclick="editPlayer(${player.id})" style="background: none; border: none; color: var(--accent-cyan); cursor: pointer; font-size: 0.95rem; font-weight: bold;">編集</button>
                <button onclick="deletePlayer(${player.id})" style="background: none; border: none; color: rgba(239, 68, 68, 0.8); cursor: pointer; font-size: 0.95rem; font-weight: bold;">削除</button>
            </div>
        `;
        list.appendChild(card);
    });
}

// =========================================
// スマホ（iOS）特有のピンチズームを完全に無効化する処理
// =========================================
document.addEventListener('touchstart', (e) => {
    // 2本指以上でタッチされたら、その動作を無効化する
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    // 2本指以上でなぞられたら（ピンチイン・アウト）、その動作を無効化する
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

// =========================================
// 編集中に、元のカード（薄くなっている部分）をタップしてキャンセルする機能
// =========================================
document.addEventListener('click', (e) => {
    // 1. 誰も編集していなければ何もしない
    if (!editingPlayerId) return;

    // 2. 「編集」や「削除」などのボタンを押した時は無視する
    if (e.target.closest('button')) return;

    // 3. 今編集で薄くなっているカード本体を取得
    const editingCard = document.getElementById(`player-card-${editingPlayerId}`);
    
    // 4. タップした場所が、まさに「その薄くなっているカード」の中だった場合
    if (editingCard && editingCard.contains(e.target)) {
        toggleForm(true); // キャンセルボタンを押した時と同じ処理（閉じて戻る）を発動！
    }
});