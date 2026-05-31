import { Divider } from '@mui/material';
import { useApp } from '../../context/AppContext';
import { KeySetup } from './KeySetup';
import { KeyLocked } from './KeyLocked';
import { KeyUnlocked } from './KeyUnlocked';

export function KeySection() {
  const { ecdhPrivKey, keyInStorage } = useApp();

  return (
    <>
      <Divider />
      {!keyInStorage && <KeySetup />}
      {keyInStorage && !ecdhPrivKey && <KeyLocked />}
      {ecdhPrivKey !== null && <KeyUnlocked />}
    </>
  );
}
