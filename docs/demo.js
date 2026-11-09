const select = document.querySelector('#case')
const button = document.querySelector('#check')
const result = document.querySelector('#result')

async function loadCases() {
  const response = await fetch('./cases.json')
  if (!response.ok) throw new Error('No se pudieron cargar los casos.')
  const cases = await response.json()
  for (const [index, example] of cases.entries()) {
    select.add(new Option(example.title, String(index)))
  }

  function showDoses() {
    const example = cases[Number(select.value)]
    document.querySelector('#prescribed').textContent = example.prescribed
    document.querySelector('#entered').textContent = example.entered
    result.textContent = ''
    result.className = ''
  }

  select.addEventListener('change', showDoses)
  button.addEventListener('click', () => {
    const example = cases[Number(select.value)]
    const title = document.createElement('strong')
    title.textContent = example.blocked ? 'Alerta crítica · Bloqueado' : 'Dosis equivalente'
    const message = document.createElement('p')
    message.textContent = example.message
    result.className = example.blocked ? 'blocked' : ''
    result.replaceChildren(title, message)
  })

  showDoses()
  select.disabled = false
  button.disabled = false
}

loadCases().catch(() => {
  result.textContent = 'No se pudieron cargar los casos. Recarga la página para volver a intentar.'
})
