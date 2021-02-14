import React from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Link,
  useParams
} from "react-router-dom";

const DOMAIN = "localhost:8080";

async function create_room(num_players) {
  const response = await fetch(`http://${DOMAIN}/api/v1/room`, {
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
  const response = await fetch(`http://${DOMAIN}/api/v1/room/${roomid}`, {
    credentials: "include"
  });
  const res = await response.json();
  return res;
}

async function register_as_player(roomid) {
  try {
    await fetch(`http://${DOMAIN}/api/v1/room/${roomid}/register`, {
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
    await fetch(`http://${DOMAIN}/api/v1/room/${roomid}/attack`, {
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
    await fetch(`http://${DOMAIN}/api/v1/room/${roomid}/stay`, {
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
        onChange={e => setNumPlayers(e.target.value)}
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
  const attackGuess = React.useRef();

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
    const guess = parseInt(attackGuess.current.value, 10) || 0;
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
      const socket = new WebSocket(`ws://${DOMAIN}/api/v1/room/${roomid}/ws`);
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
      <div>
        {canRegister && (
          <button onClick={onRegister}>Register as a player</button>
        )}
      </div>
      {canAttack() && (
        <div>
          <input
            type="number"
            min="1"
            max={room.board.num_players}
            ref={attackTargetPlayer}
          />
          <input type="number" min={1} ref={attackTargetHandIndex} />
          <input type="number" min={0} max={23} ref={attackGuess} />
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

export default App;
