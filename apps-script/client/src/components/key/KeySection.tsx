import { Divider } from '@mui/material';
import { useApp } from '../../context/AppContext';
import { KeySetup } from './KeySetup';
import { KeyLocked } from './KeyLocked';
import { KeyUnlocked } from './KeyUnlocked';
import { PresharedKeySection } from './PresharedKeySection';

export function KeySection() {
  const { ecdhPrivKey, keyInStorage, presharedKey } = useApp();

  const showSetup = !keyInStorage && !presharedKey;
  const showLocked = keyInStorage && !ecdhPrivKey;
  const showUnlocked = ecdhPrivKey !== null;

  return (
    <>
      <Divider />
      {showSetup && <KeySetup />}
      {showLocked && <KeyLocked />}
      {showUnlocked && <KeyUnlocked />}
      {presharedKey !== null && (
        <>
          {(showUnlocked || showLocked || showSetup) && <Divider sx={{ mx: 1.5 }} />}
          <PresharedKeySection />
        </>
      )}
    </>
  );
}
