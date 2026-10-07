-- Canvas-authored fixture: a Lua file with a deliberate parse error in the
-- middle. Everything before and after it must still be extracted.

local function OnLogin(event, player)
    player:SendBroadcastMessage("hello")
end

function Broken(
    local = = 1
end

function OnLogout(event, player)
end

RegisterPlayerEvent(3, OnLogin)
