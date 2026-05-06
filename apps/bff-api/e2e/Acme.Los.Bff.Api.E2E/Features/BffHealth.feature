Feature: BFF health

  Scenario: BFF health reports the API service snapshot
    When I request the BFF health snapshot
    Then the response status code should be OK
    And the health snapshot should report service "bff-api" with status "ok"
