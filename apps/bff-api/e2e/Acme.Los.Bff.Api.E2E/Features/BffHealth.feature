Feature: BFF health

  Scenario: BFF health reports the API service snapshot
    When I request the BFF health snapshot
    Then the response status code should be OK
    And the health snapshot should report service "bff-api" with status "ok"

  Scenario: BFF liveness endpoint responds
    When I request the BFF live health endpoint
    Then the response status code should be OK

  Scenario: BFF readiness endpoint responds
    When I request the BFF ready health endpoint
    Then the response status code should be OK

  Scenario: BFF OpenAPI document is available in development
    When I request the BFF OpenAPI document
    Then the response status code should be OK
    And the response body should contain an OpenAPI document
