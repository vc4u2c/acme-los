import { ContentPageShell } from '../../../components/web/content-page-shell';

export default function AccessibilityPage() {
  return (
    <ContentPageShell
      eyebrow="Accessibility"
      title="Build the lending flow so more people can use it"
      intro="Accessibility belongs in the footer because it is part of trust. Application flows in this category should be keyboard-friendly, readable, and clear in both light and dark mode."
      sections={[
        {
          title: 'Readable structure',
          body: 'Use strong heading order, form labels, support text, and error messages so each step is understandable without guesswork.',
        },
        {
          title: 'Keyboard and screen reader support',
          body: 'Navigation, dialogs, menus, progress controls, and form fields should all remain operable without a mouse.',
        },
        {
          title: 'Contrast and theming',
          body: 'Light and dark themes should both preserve contrast, focus visibility, and readable state changes across all major actions.',
        },
        {
          title: 'Support path',
          body: 'Provide a real support route for accessibility issues so customers can get help completing time-sensitive steps.',
        },
      ]}
    />
  );
}
