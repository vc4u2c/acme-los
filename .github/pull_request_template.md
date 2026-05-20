## Summary

- describe the user-facing or developer-facing change

## Verification

- [ ] `npx.cmd prettier --check .`
- [ ] `npx.cmd nx run-many -t lint test --all --outputStyle=stream`
- [ ] `npx.cmd nx run web-app:build --skip-nx-cache` if web/auth/runtime changed
- [ ] `dotnet test apps/bff-api/Acme.Los.Bff.sln` if BFF/auth/service-auth changed
- [ ] relevant `az bicep build --file ...` checks if Azure/IaC changed
- [ ] `npx.cmd nx run mobile-app-e2e:e2e --outputStyle=stream` if mobile changed
- [ ] `npx.cmd nx run web-app-e2e:e2e --outputStyle=stream --skip-nx-cache` if web UX/auth changed

## Release Notes

- indicate whether this should affect `web-app`, `mobile-app`, both, or neither
