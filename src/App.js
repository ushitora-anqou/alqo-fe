import React from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Link,
  useParams
} from "react-router-dom";
import "./App.css";

async function create_room(num_players) {
  const response = await fetch(`/api/v1/room`, {
    method: "POST",
    mode: "cors",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ num_players: num_players })
  });
  const res = await response.json();
  return res.roomid;
}

async function get_room_info(roomid) {
  const response = await fetch(`/api/v1/room/${roomid}`, {
    credentials: "include"
  });
  const res = await response.json();
  return res;
}

async function register_as_player(roomid) {
  try {
    await fetch(`/api/v1/room/${roomid}/register`, {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      }
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function attack(roomid, target_player, target_hand_index, guess) {
  try {
    await fetch(`/api/v1/room/${roomid}/attack`, {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ target_player, target_hand_index, guess })
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function stay(roomid) {
  try {
    await fetch(`/api/v1/room/${roomid}/stay`, {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      }
    });
    return true;
  } catch (e) {
    return false;
  }
}

function App() {
  const [numPlayers, setNumPlayers] = React.useState(2);
  const [rooms, setRooms] = React.useState([]);

  async function createNewRoom(e) {
    const roomid = await create_room(numPlayers);
    setRooms(rooms => [...rooms, roomid]);
  }

  return (
    <Router>
      <input
        type="number"
        value={numPlayers}
        min={2}
        max={4}
        onChange={e => setNumPlayers(parseInt(e.target.value))}
      />
      <button onClick={createNewRoom}>Create a new room</button>
      <ul>
        {rooms.map(roomid => (
          <li key={roomid}>
            <Link to={"/room/" + roomid}>{roomid}</Link>
          </li>
        ))}
      </ul>
      <Switch>
        <Route path="/room/:roomid" children={<Room />} />
      </Switch>
    </Router>
  );
}

function Room() {
  const { roomid } = useParams();
  const [room, setRoom] = React.useState({});
  const [canRegister, setCanRegister] = React.useState(false);
  const [socket, setSocket] = React.useState(null);
  const attackTargetPlayer = React.useRef();
  const attackTargetHandIndex = React.useRef();
  const attackGuessColor = React.useRef();
  const attackGuessNum = React.useRef();

  async function updateRoomState() {
    const room = await get_room_info(roomid);
    setRoom(room);
    return room;
  }

  async function onRegister() {
    if (await register_as_player(roomid)) {
      setCanRegister(false);
      await updateRoomState();
    }
  }

  async function onAttack(e) {
    const target_player = parseInt(attackTargetPlayer.current.value, 10) || 1;
    const target_hand_index =
      parseInt(attackTargetHandIndex.current.value, 10) || 1;
    const guessNum = parseInt(attackGuessNum.current.value, 10) || 0;
    const guessColor = attackGuessColor.current.value === "white" ? 1 : 0;
    const guess = 2 * guessNum + guessColor;
    if (await attack(roomid, target_player, target_hand_index, guess))
      await updateRoomState();
  }

  async function onStay(e) {
    if (await stay(roomid)) await updateRoomState();
  }

  function hasGameFinished() {
    return room.status === "playing" && room.board.winner !== null;
  }

  function canAttack() {
    return (
      room.status === "playing" &&
      !hasGameFinished() &&
      room.board.current_turn === room.board.your_player_index &&
      room.board.attacker_card !== null
    );
  }

  function canStay() {
    return canAttack() && room.board.can_stay;
  }

  React.useEffect(() => {
    async function impl() {
      const socket = new WebSocket(
        `ws://${window.location.host}/api/v1/room/${roomid}/ws`
      );
      socket.onclose = async e => {
        console.log(`ws closed ${e.code}`);
      };
      socket.onmessage = async e => {
        const [event, data] = JSON.parse(e.data);
        switch (event) {
          case "player_registered":
          case "game_started":
          case "your_hand":
          case "your_turn":
          case "attacked":
          case "stayed":
          case "attacker_card_chosen":
          case "game_finished":
            // FIXME
            await updateRoomState();
            break;
        }
      };
      setSocket(old => {
        if (old !== null) old.close();
        return socket;
      });

      const room = await updateRoomState();
      if (
        !(
          (room.status === "playing" && room.current_turn !== null) ||
          (room.status === "not_started" && room.your_status)
        )
      )
        setCanRegister(true);
    }
    impl();
  }, [roomid]);

  return (
    <div>
      <h1>Room #{roomid}</h1>
      {room.status === "not_started" && <h2>Waiting players...</h2>}
      {room.status === "playing" && !hasGameFinished() && <h2>Playing</h2>}
      {hasGameFinished() && !room.board.your_player_index && (
        <h2>Player {room.board.winner} won!</h2>
      )}
      {hasGameFinished() &&
        room.board.winner === room.board.your_player_index && <h2>You won!</h2>}
      {hasGameFinished() &&
        room.board.your_player_index &&
        room.board.winner !== room.board.your_player_index && (
          <h2>You lost...</h2>
        )}
      {Game(room)}
      <div>
        {canRegister && (
          <button onClick={onRegister}>Register as a player now!</button>
        )}
      </div>
      {canAttack() && (
        <div>
          <input
            type="number"
            placeholder="player index"
            min="1"
            max={room.board.num_players}
            ref={attackTargetPlayer}
          />
          <input
            type="number"
            placeholder="card index"
            min={1}
            ref={attackTargetHandIndex}
          />
          <select size="2" ref={attackGuessColor}>
            <option value="white" selected>
              White
            </option>
            <option value="black">Black</option>
          </select>
          <input
            type="number"
            placeholder="guess"
            min={0}
            max={23}
            ref={attackGuessNum}
          />
          <button onClick={onAttack}>Attack</button>
        </div>
      )}
      <div>{canStay() && <button onClick={onStay}>Stay</button>}</div>
      <div>
        <pre>{JSON.stringify(room, null, 2)}</pre>
      </div>
    </div>
  );
}

function Game(room) {
  if (room.status === "not_started") {
    return (
      <div>
        <p>Max players: {room.num_players}</p>
        <p>Players currently registered: {room.registered}</p>
        {room.your_index === null && <p>You've not yet registered.</p>}
        {room.your_index !== null && (
          <p>
            You've already registered! Your player index is {room.your_index}.
          </p>
        )}
      </div>
    );
  } else if (room.status === "playing") {
    const b = room.board;
    return (
      <div>
        <div>
          <span className="game-player-index-you"></span>
          <span className="game-player-index">Deck top</span>
          {b.deck_top !== null && b.deck_top[0] === 0 && (
            <span className="game-black-card"></span>
          )}
          {b.deck_top !== null && b.deck_top[0] === 1 && (
            <span className="game-white-card"></span>
          )}
        </div>
        <div>
          <span className="game-player-index-you"></span>
          <span className="game-player-index">Attacker</span>
          {b.attacker_card[0] === 1 && b.attacker_card[1][0] === 0 && (
            <span className="game-black-card"></span>
          )}
          {b.attacker_card[0] === 1 && b.attacker_card[1][0] === 1 && (
            <span className="game-white-card"></span>
          )}
        </div>
        {b.hands.map((hand, pi_minus_1) => (
          <div>
            <span className="game-player-index-you">
              {pi_minus_1 + 1 === b.your_player_index && "You"}
            </span>
            <span className="game-player-index">{pi_minus_1 + 1}.</span>
            {hand.map(([n, hidden, uuid]) => Card(n, hidden, uuid))}
            {pi_minus_1 + 1 === b.current_turn && (
              <span className="game-player-index-current-turn">
                &lt;== TURN
              </span>
            )}
          </div>
        ))}
        <hr />
        {b.your_hand && (
          <div>
            <span className="game-player-index-you"></span>
            <span className="game-player-index">Yours</span>
            {b.your_hand.map(n => Card(n, false))}
            <span className="game-player-index-current-turn"></span>
          </div>
        )}
        {b.your_attacker_card_from_deck && (
          <div>
            <span className="game-player-index-you"></span>
            <span className="game-player-index">Attacker</span>
            {Card(b.your_attacker_card_from_deck, false)}
            <span className="game-player-index-current-turn"></span>
          </div>
        )}
      </div>
    );
  }
}

function Card(n, hidden, uuid) {
  const black = n % 2 === 0;
  const num = Math.floor(n / 2);

  if (hidden && black) return <span className="game-black-card"></span>;
  else if (hidden && !black) return <span className="game-white-card"></span>;
  else if (!hidden && black)
    return <span className="game-black-card">{num}</span>;
  else if (!hidden && !black)
    return <span className="game-white-card">{num}</span>;
}

export default App;
