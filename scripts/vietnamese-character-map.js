// Shared source-model names for the Vietnamese data builder and the full compiler.
export const vietnameseHelperStems=new Set(['acute','breve','dotbelow','hookabove','tilde']);
export const vietnameseCreeperCharacters={
 creeper_grave:'À',creeper_acute:'Á',creeper_hookabove:'Ả',creeper_tilde:'Ã',creeper_dotbelow:'Ạ',
 creeper_breve:'Ă',creeper_breve_grave:'Ằ',creeper_breve_acute:'Ắ',creeper_breve_hookabove:'Ẳ',creeper_breve_tilde:'Ẵ',creeper_breve_dotbelow:'Ặ',
 creeper_circumflex:'Â',creeper_circumflex_grave:'Ầ',creeper_circumflex_acute:'Ấ',creeper_circumflex_hookabove:'Ẩ',creeper_circumflex_tilde:'Ẫ',creeper_circumflex_dotbelow:'Ậ'
};

export function getVietnameseCharacterKey(stem) {
  if (vietnameseHelperStems.has(stem)) return null;
  return (vietnameseCreeperCharacters[stem] ?? stem).normalize('NFC');
}
