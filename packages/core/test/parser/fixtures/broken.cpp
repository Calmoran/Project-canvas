// Canvas-authored fixture: a C++ file with a deliberate parse error in the
// middle. Everything before and after it must still be extracted.

class BeforeTheError : public ScriptObject
{
public:
    void OnLogin(Player* player) override { player->CastSpell(player, 116); }
};

void FirstFunction()
{
    int x = 1;
}

void BrokenFunction()
{
    int y = (2 +* ;;; ]] 3;
    if (y) { return ]] ; }
}

class AfterTheError
{
};

void LastFunction(int a)
{
    return;
}
