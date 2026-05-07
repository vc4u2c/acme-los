Feature: BFF security

  Scenario: CSRF endpoint issues a token contract and browser cookie
    When I request a BFF CSRF token
    Then the response status code should be OK
    And the CSRF token contract should include a token
    And the CSRF response should include an HTTP-only Lax cookie

  Scenario: CSRF cookie is secure behind forwarded HTTPS
    Given the request is forwarded over HTTPS
    When I request a BFF CSRF token
    Then the response status code should be OK
    And the CSRF cookie should be Secure
