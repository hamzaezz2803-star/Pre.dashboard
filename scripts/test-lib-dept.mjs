import { getArbreDepartements, getDepartementsParents, listerDepartementsFiltreArbre } from '../lib/departements.js';

async function test() {
  console.log('--- TEST GET DEPARTEMENTS PARENTS ---');
  const parents = await getDepartementsParents();
  console.table(parents);

  console.log('--- TEST GET ARBRE DEPARTEMENTS ---');
  const arbre = await getArbreDepartements();
  console.log(JSON.stringify(arbre, null, 2));

  console.log('--- TEST LISTER DEPARTEMENTS FILTRE ARBRE ---');
  const filtre = await listerDepartementsFiltreArbre();
  console.table(filtre);

  process.exit(0);
}

test();
