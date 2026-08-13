import {
  CompaniaConActividad,
  CompaniaReadModel,
  CompaniasReadRepository,
} from '../ports/companias-read.repository';

export async function conNombreActividad(
  repository: CompaniasReadRepository,
  companias: CompaniaReadModel[],
): Promise<CompaniaConActividad[]> {
  const codigos = [
    ...new Set(
      companias
        .map((compania) => compania.ciiuNivel6)
        .filter((codigo): codigo is string => Boolean(codigo)),
    ),
  ];
  const nombres = codigos.length
    ? await repository.findActivityNames(codigos)
    : new Map<string, string>();

  return companias.map((compania) => ({
    ...compania,
    actividad: compania.ciiuNivel6
      ? (nombres.get(compania.ciiuNivel6) ?? null)
      : null,
  }));
}
